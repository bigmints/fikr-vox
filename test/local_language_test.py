import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('language',Path(__file__).parents[1]/'local-tts/language.py')
language=importlib.util.module_from_spec(spec);spec.loader.exec_module(language)
class LanguageTests(unittest.TestCase):
    def test_supported_routes_and_languages(self):
        language.validate({'model':'whisper-base','language':'ml','task':'transcribe'},'transcribe')
        language.validate({'model':'m2m100','source':'en','target':'ml','text':'Hello'},'translate')
        for request,operation in [({'model':'whisper-base','language':'or'},'transcribe'),({'model':'m2m100'},'transcribe'),({'model':'m2m100','source':'en','target':'te','text':'Hello'},'translate'),({'model':'m2m100','source':'en','target':'ml','text':'x'*12001},'translate')]:
            with self.assertRaises(ValueError):language.validate(request,operation)
    def test_long_translation_segments_keep_every_character(self):
        class Tokenizer:
            def encode(self,text,**kwargs):return list(text)
        text='നമസ്കാരം. Hello! '*500
        parts=language.segments(text,Tokenizer(),limit=450)
        self.assertEqual(''.join(parts),text)
        self.assertTrue(all(len(part)<=450 for part in parts))
if __name__=='__main__':unittest.main()
