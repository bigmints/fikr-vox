import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("engine", Path(__file__).parents[1] / "local-tts/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class InputTests(unittest.TestCase):
    def test_chunking_preserves_words_and_bounds_unspaced_text(self):
        text = "This is a sentence. " * 200
        parts = list(engine.chunks(text))
        self.assertEqual(" ".join(parts).split(), text.split())
        self.assertTrue(all(len(p) <= 350 for p in parts))
        text = "文" * 1000
        self.assertEqual("".join(engine.chunks(text)), text)

    def test_cloning_requires_reference_and_transcript(self):
        for model in ("qwen3", "qwen3-hq", "omnivoice"):
            with self.assertRaises(ValueError):
                engine.validate({"engine":model, "language":"en", "text":"hello"})

    def test_multilingual_clone_accepts_malayalam_and_rejects_unsupported_engines(self):
        request = {"engine":"omnivoice", "language":"ml", "text":"നമസ്കാരം", "reference":"voice.wav", "referenceText":"Exact reference words."}
        self.assertEqual(engine.validate(request)["modelType"], "omnivoice")
        for key in ("qwen3", "qwen3-hq", "kokoro"):
            with self.assertRaisesRegex(ValueError, "language"):
                engine.validate({**request, "engine":key})
        with self.assertRaisesRegex(ValueError, "transcript"):
            engine.validate({**request, "referenceText":""})

    def test_all_presets_and_language_matching(self):
        for voice, language in engine.CATALOG['kokoro']['voiceLanguages'].items():
            engine.validate({'engine':'kokoro', 'voice':voice, 'language':language, 'text':'hello'})
            with self.assertRaisesRegex(ValueError, 'matching'):
                engine.validate({'engine':'kokoro', 'voice':voice, 'language':'ja' if language == 'en' else 'en', 'text':'hello'})
        for voice in engine.CATALOG['qwen3-custom']['voices']:
            engine.validate({'engine':'qwen3-custom', 'voice':voice, 'language':'en', 'text':'hello'})

    def test_omnivoice_keeps_short_sentences_in_one_natural_take(self):
        text = 'നമസ്കാരം. നമ്മുടെ പോഡ്കാസ്റ്റിലേക്ക് സ്വാഗതം. ഇന്ന് ഒരു പുതിയ ആശയം നമുക്ക് ഒരുമിച്ച് പരിചയപ്പെടാം.'
        self.assertEqual(list(engine.continuous_chunks(text)), [(text, False)])
        long_text = 'Hello there. ' * 100
        parts = list(engine.continuous_chunks(long_text))
        self.assertEqual(' '.join(p for p, _ in parts).split(), long_text.split())
        self.assertTrue(all(len(p) <= 350 for p, _ in parts))

    def test_omnivoice_uses_training_language_ids_not_display_names(self):
        for key in ('omnivoice', 'omnivoice-presets'):
            spec = engine.CATALOG[key]
            self.assertEqual(engine.omnivoice_language(spec, 'ml'), 'ml')
            self.assertEqual(engine.omnivoice_language(spec, 'en'), 'en')
            self.assertEqual(engine.omnivoice_language(spec, 'ar'), 'arb')
            self.assertEqual(engine.omnivoice_language(spec, 'ne'), 'npi')
            self.assertEqual(engine.omnivoice_language(spec, 'or'), 'ory')

    def test_bundled_presets_have_verified_audio_and_need_no_user_reference(self):
        import hashlib
        from unittest.mock import patch
        spec = engine.CATALOG['omnivoice-presets']
        self.assertEqual(len(spec['voices']), 4)
        for voice in spec['voices']:
            engine.validate({'engine':'omnivoice-presets', 'voice':voice, 'language':'ml', 'text':'നമസ്കാരം'})
            audio, transcript = engine.preset_reference(spec, voice)
            self.assertTrue(3 <= len(audio)/24000 <= 30)
            self.assertIn('Welcome', transcript)
            audio_ml, transcript_ml = engine.preset_reference(spec, voice, 'ml')
            self.assertTrue(3 <= len(audio_ml)/24000 <= 30)
            self.assertIn('നമസ്കാരം', transcript_ml)
            with patch.object(engine, 'load_reference') as load:
                damaged = {**spec, 'voiceReferences': {voice:{**spec['voiceReferences'][voice], 'sha256':'invalid'}}}
                with self.assertRaisesRegex(ValueError, 'missing or damaged'):
                    engine.preset_reference(damaged, voice)
                load.assert_not_called()
        with self.assertRaisesRegex(ValueError, 'preset'):
            engine.validate({'engine':'omnivoice-presets','voice':'invented','language':'ml','text':'Hi'})

    def test_design_variations_are_seeded_by_the_immutable_preview_job(self):
        self.assertEqual(engine.design_seed('first-preview'), engine.design_seed('first-preview'))
        self.assertNotEqual(engine.design_seed('first-preview'), engine.design_seed('second-preview'))

    def test_experimental_tone_is_sent_as_guidance_and_stays_mutually_exclusive(self):
        self.assertEqual(engine.design_attributes('female, casual conversational tone', 'ml'), 'female, casual, conversational')
        self.assertEqual(engine.voice_tone('female, casual conversational tone'), 'casual, conversational')
        self.assertEqual(engine.voice_tone('female, whisper'), 'whisper')
        self.assertEqual(engine.voice_tone('female'), 'None')
        with self.assertRaisesRegex(ValueError, 'Choose one tone'):
            engine.design_attributes('female, whisper, casual conversational tone', 'ml')

    def test_plain_descriptions_resolve_to_supported_traits(self):
        self.assertEqual(engine.design_attributes('A young adult woman with a lower pitch.', 'ml'), 'female, young adult, low pitch')
        self.assertEqual(engine.design_attributes('A mature male voice, very deep, with a British accent.', 'en'), 'male, middle-aged, very low pitch, british accent')
        self.assertEqual(engine.design_attributes('A woman whispering in an Indian accent.', 'ml'), 'female, whisper')
        self.assertEqual(engine.design_attributes('A female voice with moderate pitch.', 'en'), 'female, moderate pitch')
        for text in ('male and female', 'very low and high pitch', 'young and elderly', 'male, British and American accents'):
            with self.assertRaisesRegex(ValueError, 'Choose one'):
                engine.design_attributes(text, 'en')
        with self.assertRaisesRegex(ValueError, 'at least one'):
            engine.design_attributes('Something nice and welcoming', 'ml')
        request = {'engine':'omnivoice-design','language':'ml','text':'നമസ്കാരം','instruct':'A young female voice.'}
        self.assertEqual(engine.validate(request)['mode'], 'design')
        with self.assertRaisesRegex(ValueError, 'Describe'):
            engine.validate({**request, 'instruct':''})

    def test_design_requires_description(self):
        with self.assertRaisesRegex(ValueError, 'Describe'):
            engine.validate({'engine':'qwen3-design', 'language':'en', 'text':'hello'})
        engine.validate({'engine':'qwen3-design', 'language':'en', 'text':'hello', 'instruct':'Warm adult female voice'})

    def test_non_english_chunks_preserve_text_without_phoneme_truncation(self):
        from types import SimpleNamespace
        pipeline = SimpleNamespace(g2p=lambda text: (text * 6, None))
        model = SimpleNamespace(_get_pipeline=lambda language: pipeline)
        text = '文字' * 200 + '。\n' + '言葉' * 30
        parts = list(engine.kokoro_delivery_chunks(model, text, 'zf_xiaobei'))
        self.assertEqual(''.join(part for part, _ in parts), text.replace('\n', ''))
        self.assertTrue(all(len(part) * 6 <= 500 for part, _ in parts))
        self.assertEqual(sum(pause for _, pause in parts), 1)


if __name__ == "__main__":
    unittest.main()
