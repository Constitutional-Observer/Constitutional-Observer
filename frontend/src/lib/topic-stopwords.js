// Extra stopwords for topic modeling, applied after winkNLP lemmatization
// regardless of part-of-speech. winkNLP's lite web model tags honorifics like
// "Shri"/"Mr" as proper nouns, so they pass the NOUN/PROPN/ADJ filter and must
// be removed explicitly here. Edit freely — everything is matched lowercase.

const HONORIFICS = [
  "mr", "mrs", "ms", "miss", "sir", "madam", "madame",
  "shri", "shrimati", "smt", "sri", "kumari", "thiru", "thiruvalar",
  "dr", "prof", "professor", "hon", "honble", "honourable", "honorable",
  "ji", "sahib", "sahab", "begum", "sardar", "maulana", "syed",
];

// Parliamentary / procedural boilerplate that dominates debate text but
// carries little topical signal. Kept deliberately conservative — these are
// discourse scaffolding, not subject matter.
const PROCEDURAL = [
  "speaker", "chairman", "chairperson", "deputy", "vice",
  "member", "members", "minister", "ministry",
  "house", "sabha", "lok", "rajya", "vidhan", "parishad", "assembly",
  "session", "sitting", "adjourn", "adjourned", "adjournment",
  "question", "questions", "answer", "answered", "reply", "replied",
  "supplementary", "starred", "unstarred",
  "motion", "resolution", "amendment", "clause", "subclause",
  "point", "order", "proceeding", "proceedings", "record",
  "gentleman", "gentlemen", "lady", "friend", "colleague",
  "yes", "no", "please", "thank", "thanks", "kindly",
  "shall", "would", "could", "may", "must", "ought",
  "hereby", "thereof", "therein", "pleased", "thereto", "whereas", "aforesaid",
];

// Generic English function words — backup in case the lite model fails to flag
// some of them as stopwords.
const FUNCTION_WORDS = [
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "her", "was", "one", "our", "out", "has", "his", "had", "him", "she",
  "they", "them", "their", "this", "that", "these", "those", "there",
  "here", "what", "which", "who", "whom", "whose", "when", "where", "why",
  "how", "than", "then", "also", "such", "some", "more", "most", "much",
  "very", "into", "onto", "upon", "with", "from", "about", "above", "below",
  "after", "before", "again", "further", "once", "other", "another",
  "shall", "will", "should", "being", "been", "have", "having", "does",
  "did", "doing", "done", "get", "got", "make", "made", "say", "said",
  "saying", "give", "given", "take", "taken", "come", "came", "went",
  // Common adverbs / connectives the lite model sometimes mis-tags as nouns:
  "yes", "true", "false", "still", "even", "well", "matter", "back", "ago",
];

// Temporal / structural fillers that survive POS filtering but carry no
// topical content. Kept intentionally narrow — substantive nouns like
// "country", "state", "law", "policy" are NOT here because they are
// genuinely topical in parliamentary discourse.
const FILLER_NOUNS = [
  "day", "year", "month", "week", "today", "time", "date",
];

// ─── Indian-language stopwords ──────────────────────────────────────────
// One focused list per major script. Each contains pronouns, postpositions,
// be-/auxiliary verbs, interrogatives, common conjunctions, and a handful of
// discourse particles. Substantive nouns (country names, policy domain words,
// etc.) are intentionally NOT included — they're often the topic.
//
// Notes on coverage:
//   - winkNLP cannot lemmatize Indic scripts, so we match the surface form.
//     That means each inflectional variant has to be listed separately
//     (हैं/था/थे, करता/करती/किया, etc.).
//   - Hindi/Marathi/Sanskrit all share Devanagari and overlap heavily;
//     they're merged into one list.
//   - Lists are intentionally not exhaustive — add words as you see them
//     dominate clusters. Re-running the topic map after editing picks up
//     changes immediately.

// Devanagari — Hindi, Marathi, Sanskrit
const DEVANAGARI = [
  // Pronouns
  "मैं", "तू", "तुम", "आप", "हम", "वह", "वे", "यह", "ये",
  "मुझे", "मुझको", "हमें", "तुम्हें", "आपको", "उसे", "उन्हें", "इसे", "इन्हें",
  "मेरा", "मेरी", "मेरे", "हमारा", "हमारी", "हमारे",
  "तेरा", "तेरी", "तेरे", "तुम्हारा", "तुम्हारी", "तुम्हारे", "आपका", "आपकी", "आपके",
  "उसका", "उसकी", "उसके", "उनका", "उनकी", "उनके",
  "इसका", "इसकी", "इसके", "इनका", "इनकी", "इनके",
  // Postpositions / case markers
  "का", "की", "के", "को", "से", "में", "पर", "तक", "द्वारा", "लिए", "साथ", "बाद",
  // Be-verb / auxiliaries
  "है", "हैं", "था", "थे", "थी", "थीं", "हो", "हूँ", "हूं", "हुआ", "हुई", "हुए",
  "होता", "होती", "होते", "होगा", "होगी", "होंगे", "रहा", "रही", "रहे", "रहना",
  // Do/go/give/take auxiliaries
  "कर", "करना", "करता", "करती", "करते", "किया", "करेगा", "करेगी", "करेंगे",
  "गया", "गई", "गए", "जाना", "जाता", "जाती", "जाते",
  "दिया", "लिया", "देना", "लेना",
  "सकता", "सकती", "सकते", "सकना",
  // Interrogatives / relatives
  "क्या", "कौन", "कब", "कहाँ", "कहां", "क्यों", "कैसे", "कितना", "कितनी", "कितने",
  "जो", "जिस", "जिसे", "जिसको", "जिसका", "जिसकी", "जिसके", "जब", "जहाँ", "जहां", "जैसे",
  // Conjunctions / discourse
  "और", "या", "किन्तु", "परन्तु", "लेकिन", "मगर", "कि", "तो", "भी", "ही",
  "नहीं", "ना", "मत", "नही", "हाँ", "हां",
  "फिर", "अब", "तब", "जब", "अभी", "वहाँ", "वहां", "यहाँ", "यहां",
  "अगर", "यदि", "क्योंकि", "इसलिए", "ताकि", "इसके", "उसके",
  "एक", "दो", "बहुत", "कुछ", "सब", "सभी", "कोई", "हर", "प्रत्येक",
  "तरह", "बात", "आदि", "ऐसा", "ऐसी", "ऐसे", "वैसा", "वैसी", "वैसे",
];

// Tamil
const TAMIL = [
  // Pronouns
  "நான்", "நாம்", "நாங்கள்", "நீ", "நீங்கள்", "நீர்", "அவன்", "அவள்", "அவர்", "அவர்கள்",
  "இவன்", "இவள்", "இவர்", "இவர்கள்", "இது", "அது", "இவை", "அவை",
  "என்", "எங்கள்", "எனது", "எங்களது", "உன்", "உங்கள்", "உனது", "உங்களது",
  "அவன்", "அவளது", "அவரது", "அவர்களது", "இவனது", "இவளது",
  // Be-verb / auxiliaries
  "இரு", "இருக்க", "இருக்கிறது", "இருக்கின்றது", "இருந்தது", "இருக்கும்",
  "உள்ளது", "உள்ளன", "உள்ள", "ஆகும்", "ஆக", "ஆகி", "ஆகிய",
  // Do / go / give / take auxiliaries
  "செய்", "செய்த", "செய்கின்ற", "செய்கிறது", "செய்யப்பட்ட", "செய்யப்படுகிறது",
  "வா", "வந்த", "வருகிற", "வரும்", "போ", "போன", "போகிற",
  "கொடு", "எடு",
  // Interrogatives / relatives
  "என்ன", "யார்", "எங்கே", "எப்போது", "ஏன்", "எப்படி", "எத்தனை", "எவ்வளவு",
  "எந்த", "எவை", "எவர்",
  // Conjunctions / discourse
  "மற்றும்", "அல்லது", "ஆனால்", "எனினும்", "என்று", "என்ற", "என", "எனில்",
  "ஆம்", "இல்லை", "இல்ல", "மட்டும்", "கூட", "தான்", "ஆவது",
  "இங்கே", "அங்கே", "இப்போது", "அப்போது", "அதன்", "இதன்", "அதனை", "இதனை",
  "மேலும்", "மேல்", "கீழ்", "முன்", "பின்", "பிறகு", "முன்பு", "மூலம்",
  "ஒரு", "ஒன்று", "சில", "பல", "எல்லா", "எல்லாம்", "மிக", "மிகவும்",
  "இந்த", "அந்த", "ஆகியவை", "போல", "போன்று", "பற்றி",
  "எனவே", "ஆகவே", "அதனால்", "ஏனெனில்", "ஏனென்றால்",
];

// Bengali
const BENGALI = [
  // Pronouns
  "আমি", "তুমি", "আপনি", "তুই", "সে", "তিনি", "আমরা", "তোমরা", "আপনারা", "তারা", "তাঁরা",
  "আমার", "আমাদের", "তোমার", "তোমাদের", "আপনার", "তার", "তাঁর", "তাদের", "তাঁদের",
  "এই", "এটা", "এটি", "এ", "সেই", "সেটা", "ওটা", "এরা", "ওরা",
  // Be-verb / auxiliaries
  "হয়", "হয়ে", "হয়েছে", "হবে", "হত", "হল", "হলে", "হলো",
  "ছিল", "ছিলেন", "ছিলাম", "আছে", "আছেন", "নেই", "থাকা", "থাকে",
  // Do / go / give / take
  "করে", "করা", "করেছে", "করবে", "করছে", "করতে",
  "যায়", "গিয়েছে", "যাবে", "এসেছে", "আসবে",
  "দিয়ে", "দিয়েছে", "নিয়ে", "নিয়েছে",
  // Interrogatives / relatives
  "কে", "কি", "কী", "কোথায়", "কখন", "কেন", "কেমন", "কত", "কোন",
  "যা", "যে", "যিনি", "যখন", "যেখানে", "যেমন",
  // Conjunctions / discourse
  "এবং", "ও", "অথবা", "কিন্তু", "তবে", "যদি", "তাহলে", "তো", "তবু",
  "না", "নাই", "নয়", "হ্যাঁ", "হাঁ",
  "থেকে", "জন্য", "সঙ্গে", "সাথে", "উপর", "নিচে", "মধ্যে", "ভিতরে",
  "পরে", "আগে", "এখন", "তখন", "এখানে", "সেখানে",
  "এক", "দুই", "কিছু", "সব", "সকল", "অনেক", "কোনো", "প্রতি",
];

// Telugu
const TELUGU = [
  // Pronouns
  "నేను", "మేము", "మనం", "నీవు", "మీరు", "అతను", "ఆమె", "వారు", "అది", "ఇది", "అవి", "ఇవి",
  "నా", "నాది", "మా", "మాది", "నీ", "నీది", "మీ", "మీది", "అతని", "ఆమెది", "వారి",
  // Be-verb / auxiliaries
  "ఉంది", "ఉంటుంది", "ఉన్నాడు", "ఉన్నారు", "ఉన్నది", "ఉన్నాయి", "ఉండే", "ఉండి",
  "అయ్యింది", "అయింది", "అవుతుంది", "అవుతున్నది", "అయిన", "అయ్యే",
  // Do / go / give / take
  "చేసే", "చేస్తాడు", "చేసిన", "చేయడం",
  "వెళ్ళు", "వచ్చిన", "ఇచ్చిన", "తీసుకున్న",
  // Interrogatives
  "ఏది", "ఏం", "ఏమి", "ఎవరు", "ఎక్కడ", "ఎప్పుడు", "ఎందుకు", "ఎలా", "ఎంత",
  // Conjunctions / discourse
  "మరియు", "లేదా", "కానీ", "కాని", "అయితే", "అయినా", "కాబట్టి",
  "నుండి", "నుంచి", "కోసం", "తో", "లో", "పై", "క్రింద",
  "ఒక", "రెండు", "కొన్ని", "అన్ని", "మాత్రమే", "ఇంకా", "మరో",
  "ఇప్పుడు", "అప్పుడు", "ఇక్కడ", "అక్కడ",
  "అదే", "ఇదే", "అలాగే", "ఇలాగే",
];

// Gujarati
const GUJARATI = [
  // Pronouns
  "હું", "તું", "તમે", "આપણે", "અમે", "તે", "તેઓ", "આ", "એ", "પેલા",
  "મારું", "મારી", "મારા", "અમારું", "અમારી", "અમારા", "તારું", "તારી", "તારા",
  "તમારું", "તમારી", "તમારા", "તેનું", "તેની", "તેના", "તેમનું", "તેમની", "તેમના",
  // Be-verb / auxiliaries
  "છે", "છો", "છીએ", "હતું", "હતી", "હતા", "હશે", "થઈ", "થયું", "થયા",
  // Do / go / give / take
  "કરે", "કરી", "કરવું", "કરેલું", "જાય", "ગયો", "ગયા", "આવ્યો", "આવ્યા",
  // Interrogatives
  "શું", "કોણ", "ક્યાં", "ક્યારે", "કેમ", "કેવી", "કેવું", "કેટલું",
  // Conjunctions / discourse
  "અને", "અથવા", "પણ", "પરંતુ", "જો", "તો", "કે",
  "નથી", "ના", "નહીં", "હા",
  "માં", "પર", "થી", "માટે", "સાથે", "નીચે",
  "આ", "એ", "બધા", "કેટલાક", "બીજું",
];

// Kannada
const KANNADA = [
  // Pronouns
  "ನಾನು", "ನಾವು", "ನೀನು", "ನೀವು", "ಅವನು", "ಅವಳು", "ಅವರು", "ಅದು", "ಇದು", "ಇವು", "ಅವು",
  "ನನ್ನ", "ನಮ್ಮ", "ನಿನ್ನ", "ನಿಮ್ಮ", "ಅವನ", "ಅವಳ", "ಅವರ",
  // Be-verb / auxiliaries
  "ಇದೆ", "ಇರುತ್ತದೆ", "ಇದ್ದರು", "ಇರುವ", "ಇರಲಿಲ್ಲ", "ಇಲ್ಲ", "ಆಗಿದೆ", "ಆದರು",
  // Interrogatives
  "ಏನು", "ಯಾರು", "ಎಲ್ಲಿ", "ಯಾವಾಗ", "ಏಕೆ", "ಹೇಗೆ", "ಎಷ್ಟು", "ಯಾವ",
  // Conjunctions / discourse
  "ಮತ್ತು", "ಅಥವಾ", "ಆದರೆ", "ಆದರೂ", "ಏಕೆಂದರೆ", "ಆದ್ದರಿಂದ",
  "ನಿಂದ", "ಗಾಗಿ", "ಮೇಲೆ", "ಕೆಳಗೆ", "ಒಳಗೆ",
  "ಒಂದು", "ಎರಡು", "ಎಲ್ಲಾ", "ಕೆಲವು", "ಮಾತ್ರ",
];

// Malayalam
const MALAYALAM = [
  // Pronouns
  "ഞാൻ", "നീ", "നിങ്ങൾ", "അവൻ", "അവൾ", "അവർ", "ഞങ്ങൾ", "നമ്മൾ", "ഇത്", "അത്", "ഇവ", "അവ",
  "എന്റെ", "ഞങ്ങളുടെ", "നിന്റെ", "നിങ്ങളുടെ", "അവന്റെ", "അവളുടെ", "അവരുടെ",
  // Be-verb / auxiliaries
  "ആണ്", "ആകുന്നു", "ഉണ്ട്", "ഉണ്ടായിരുന്നു", "ഉള്ള", "ഇല്ല", "ഇല്ലായിരുന്നു",
  // Interrogatives
  "എന്ത്", "എന്താണ്", "ആര്", "എവിടെ", "എപ്പോൾ", "എന്തുകൊണ്ട്", "എങ്ങനെ", "എത്ര",
  // Conjunctions / discourse
  "എന്ന്", "എന്നു", "ഒപ്പം", "ഒപ്പമുള്ള", "എന്നാൽ", "എങ്കിലും", "അല്ലെങ്കിൽ", "പക്ഷെ",
  "ഇല്ല", "അല്ല", "അതെ",
  "നിന്ന്", "വേണ്ടി", "ഒരു", "ചില", "എല്ലാ", "മാത്രം",
];

// Punjabi (Gurmukhi)
const PUNJABI = [
  // Pronouns
  "ਮੈਂ", "ਤੂੰ", "ਤੁਸੀਂ", "ਅਸੀਂ", "ਉਹ", "ਇਹ", "ਉਹਨਾਂ", "ਇਹਨਾਂ",
  "ਮੇਰਾ", "ਮੇਰੀ", "ਮੇਰੇ", "ਸਾਡਾ", "ਸਾਡੀ", "ਸਾਡੇ", "ਤੇਰਾ", "ਤੁਹਾਡਾ", "ਤੁਹਾਡੀ", "ਉਸਦਾ", "ਉਸਦੀ", "ਉਹਨਾਂ",
  // Postpositions
  "ਦਾ", "ਦੀ", "ਦੇ", "ਨੂੰ", "ਤੋਂ", "ਵਿੱਚ", "ਵਿਚ", "ਉੱਤੇ", "ਨਾਲ", "ਲਈ",
  // Be-verb / auxiliaries
  "ਹੈ", "ਹਨ", "ਸੀ", "ਸਨ", "ਹੋਵੇਗਾ", "ਹੋਵੇਗੀ", "ਹੋਣਗੇ", "ਹੋਇਆ", "ਹੋਈ",
  // Do / go / give / take
  "ਕਰਨਾ", "ਕਰਦਾ", "ਕਰਦੀ", "ਕਰਦੇ", "ਕੀਤਾ", "ਕੀਤੀ", "ਕਰੇਗਾ",
  "ਜਾਣਾ", "ਗਿਆ", "ਗਈ", "ਗਏ", "ਆਇਆ",
  // Interrogatives
  "ਕੀ", "ਕੌਣ", "ਕਿੱਥੇ", "ਕਦੋਂ", "ਕਿਉਂ", "ਕਿਵੇਂ", "ਕਿੰਨਾ",
  // Conjunctions / discourse
  "ਅਤੇ", "ਜਾਂ", "ਪਰ", "ਕਿਉਂਕਿ", "ਜੇ", "ਤਾਂ", "ਕਿ",
  "ਨਹੀਂ", "ਨਾ", "ਹਾਂ",
  "ਇੱਕ", "ਦੋ", "ਕੁਝ", "ਸਾਰੇ", "ਹਰ",
];

// Odia
const ODIA = [
  "ମୁଁ", "ତୁମେ", "ତୁମେମାନେ", "ସେ", "ଆମେ", "ସେମାନେ", "ଏହି", "ସେହି", "ଏହା", "ତାହା",
  "ମୋର", "ଆମର", "ତୁମର", "ତାହାର", "ସେମାନଙ୍କ",
  "ଅଛି", "ଥିଲା", "ଥିଲେ", "ହେବ", "ହୋଇଛି", "ହୋଇଥିଲା", "ନାହିଁ",
  "କଣ", "କିଏ", "କେଉଁଠାରେ", "କେବେ", "କାହିଁକି", "କେମିତି",
  "ଏବଂ", "କିମ୍ବା", "କିନ୍ତୁ", "ଯଦି", "ତାହେଲେ", "କାରଣ",
  "ରୁ", "ପାଇଁ", "ସହିତ", "ଉପରେ", "ଭିତରେ",
  "ଗୋଟିଏ", "ଦୁଇ", "କିଛି", "ସବୁ", "କୌଣସି",
];

export const TOPIC_STOPWORDS = new Set([
  ...HONORIFICS,
  ...PROCEDURAL,
  ...FUNCTION_WORDS,
  ...FILLER_NOUNS,
  ...DEVANAGARI,
  ...TAMIL,
  ...BENGALI,
  ...TELUGU,
  ...GUJARATI,
  ...KANNADA,
  ...MALAYALAM,
  ...PUNJABI,
  ...ODIA,
]);

export default TOPIC_STOPWORDS;
