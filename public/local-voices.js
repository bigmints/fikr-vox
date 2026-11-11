export const localEngineChoices = [
  ['kokoro', 'Kokoro · 54 preset voices'],
  ['qwen3-custom', 'Qwen3 · CustomVoice presets'],
  ['qwen3-design', 'Qwen3 · Design a voice'],
  ['qwen3-hq', 'Qwen3 · Quality voice clone'],
  ['qwen3', 'Qwen3 · Fast voice clone'],
  ['omnivoice-presets', 'OmniVoice · Ready-made voices'],
  ['omnivoice-design', 'OmniVoice · Create a voice'],
  ['omnivoice', 'OmniVoice · Malayalam & multilingual clone'],
];
export const isLocalPreset = engine => ['kokoro', 'qwen3-custom', 'omnivoice-presets'].includes(engine);
export const isLocalDesign = engine => ['qwen3-design', 'omnivoice-design'].includes(engine);
export const designEngineFor = profile => profile?.voiceDesign?.engine || (profile?.voiceDesign ? 'qwen3-design' : '');
export const isLocalClone = engine => ['qwen3', 'qwen3-hq', 'omnivoice'].includes(engine);
export const defaultLocalVoice = engine => engine === 'omnivoice-presets' ? 'maya' : engine === 'qwen3-custom' ? 'Ryan' : 'af_heart';
export function localVoiceChoices(models, engine, language) {
  const model = models?.[engine];
  if(language&&model?.languages&&!Object.hasOwn(model.languages,language))return [];
  return Object.entries(model?.voices || {}).filter(([id]) => engine !== 'kokoro' || !language || model.voiceLanguages?.[id] === language);
}
export const previewTexts = {
  en: "Welcome. Let's explore this idea together. I'll explain each step clearly, with a few practical examples, so you can decide what works best for you.",
  es: 'Bienvenido. Vamos a explorar esta idea juntos. Explicaré cada paso con claridad y algunos ejemplos prácticos, para que puedas decidir qué funciona mejor para ti.',
  fr: 'Bienvenue. Explorons cette idée ensemble. Je vais expliquer chaque étape clairement, avec quelques exemples pratiques, pour vous aider à choisir ce qui vous convient.',
  ml: 'നമസ്കാരം! നമ്മുടെ പോഡ്കാസ്റ്റിലേക്ക് സ്വാഗതം. ഇന്ന് ഒരു പുതിയ ആശയം നമുക്ക് ഒരുമിച്ച് പരിചയപ്പെടാം.',
  ta: 'வணக்கம். இன்று ஒரு புதிய கருத்தை நாம் ஒன்றாகப் புரிந்துகொள்வோம்.',
  te: 'నమస్కారం. ఈ రోజు మనం ఒక కొత్త ఆలోచనను కలిసి తెలుసుకుందాం.',
  kn: 'ನಮಸ್ಕಾರ. ಇಂದು ನಾವು ಒಂದು ಹೊಸ ವಿಚಾರವನ್ನು ಒಟ್ಟಿಗೆ ತಿಳಿದುಕೊಳ್ಳೋಣ.',
  bn: 'নমস্কার। আজ আমরা একসঙ্গে একটি নতুন বিষয় জানব।',
  mr: 'नमस्कार. आज आपण एक नवीन कल्पना एकत्र समजून घेऊया.',
  gu: 'નમસ્તે. આજે આપણે એક નવો વિચાર સાથે સમજીએ.',
  ur: 'السلام علیکم۔ آج ہم ایک نیا خیال مل کر سمجھیں گے۔',
  as: 'নমস্কাৰ। আজি আমি একেলগে এটা নতুন বিষয় জানিম।',
  or: 'ନମସ୍କାର। ଆଜି ଆମେ ଏକ ନୂଆ ବିଷୟ ଏକାଠି ଜାଣିବା।',
  ne: 'नमस्कार। आज हामी एउटा नयाँ विचार सँगै बुझौँ।',
  si: 'ආයුබෝවන්. අද අපි අලුත් අදහසක් එකට දැනගනිමු.',
  tr: 'Merhaba. Bugün yeni bir fikri birlikte keşfedelim.',
  id: 'Halo. Mari kita mengenal sebuah ide baru bersama hari ini.',
  vi: 'Xin chào. Hôm nay chúng ta hãy cùng tìm hiểu một ý tưởng mới.',
  th: 'สวัสดี วันนี้เรามาเรียนรู้แนวคิดใหม่ด้วยกัน',
  nl: 'Welkom. Laten we vandaag samen een nieuw idee ontdekken.',
  pl: 'Witaj. Poznajmy dziś razem nowy pomysł.',
  sv: 'Välkommen. Låt oss utforska en ny idé tillsammans i dag.',
  uk: 'Вітаю. Сьогодні разом розглянемо нову ідею.',
  ar: 'مرحباً بكم. لنستكشف هذه الفكرة معاً بخطوات واضحة وأمثلة بسيطة.',
  hi: 'नमस्ते। आइए इस विचार को एक साथ समझते हैं। मैं हर कदम को कुछ आसान उदाहरणों के साथ समझाऊँगा, ताकि आप तय कर सकें कि आपके लिए क्या बेहतर है।',
  ja: 'こんにちは。このアイデアを一緒に考えてみましょう。いくつかの具体的な例を使いながら、それぞれの手順を分かりやすく説明します。自分に合った方法を選んでください。',
  zh: '你好，让我们一起探索这个想法。我会用几个简单实用的例子，清楚地解释每一个步骤，帮助你找到最适合自己的方法。',
  it: 'Benvenuto. Esploriamo insieme questa idea. Spiegherò ogni passaggio con chiarezza e qualche esempio pratico, così potrai decidere cosa funziona meglio per te.',
  pt: 'Bem-vindo. Vamos explorar esta ideia juntos. Vou explicar cada etapa com clareza e alguns exemplos práticos, para que você possa decidir o que funciona melhor.',
  ko: '안녕하세요. 이 아이디어를 함께 살펴보겠습니다. 몇 가지 실용적인 예를 들어 각 단계를 명확하게 설명하겠습니다. 자신에게 가장 적합한 방법을 선택해 보세요.',
  de: 'Willkommen. Lassen Sie uns diese Idee gemeinsam erkunden. Ich erkläre jeden Schritt verständlich und mit praktischen Beispielen, damit Sie die passende Lösung finden.',
  ru: 'Здравствуйте. Давайте вместе рассмотрим эту идею. Я понятно объясню каждый шаг и приведу несколько практических примеров, чтобы вы могли выбрать подходящий вариант.',
};
export const localSpeechFor = (profile,settings={}) => ({speed:1,sentencePause:0,volume:1,...settings.localSpeech,...profile?.localSpeech});
export function previewSignature(request) {
  return JSON.stringify([request.engine, request.voice || '', request.language, request.text, request.instruct || '',isLocalClone(request.engine)?request.voiceAssetId||request.inputs?.voice||'':'',isLocalClone(request.engine)?(request.voiceTranscript||request.referenceText||'').trim():'',...(isLocalDesign(request.engine)?[request.speech?.speed??1,request.speech?.sentencePause??0,request.speech?.volume??1]:[])]);
}
