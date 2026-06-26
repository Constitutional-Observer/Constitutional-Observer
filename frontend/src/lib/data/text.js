import texts from "./questions.txt?raw";

let getQuestions = () => {
  // Construct a text array, with 10 elements from text file
  let fullText = texts.split("\n");

  //remove empty lines
  fullText = fullText.filter((x) => x !== "");

  let textArray = new Array();

  // Split the text into chunks of 40 elements each and store each chunk in a row of the 2D array
  let chunkSize = 5;
  let chunkCount = 30;
  let sections = 1;
  for (let i = 0; i < Math.ceil(fullText.length / chunkSize); i++) {
    const startIndex = i * chunkSize;
    const endIndex = startIndex + chunkSize;
    const currentChunk = fullText.slice(startIndex, endIndex);

    if (textArray.length < chunkCount) {
      textArray.push(currentChunk);
    } else {
      break;
    }
  }

  // reformat the textArray to be a 3d array, with a n * 4 * chunkSize elements
  let reformattedTextArray = [];
  for (let i = 0; i < textArray.length; i += sections) {
    let innerArray = [];
    for (let j = 0; j < sections; j++) {
      if (!textArray[i + j]) break;
      innerArray.push(textArray[i + j]);
    }

    reformattedTextArray.push(innerArray);
  }

  return reformattedTextArray;
};

export let questions = getQuestions();
export let text;
//create a 2d array with 10 * 10 elements

export let text2 = ["Who should the nation pray to?"];
export let text1 = [];
export let images = [
  {
    link: "/stage1-1.jpeg",
    type: "image",
    title: "What was the Constituent Assembly?",
    caption:
      "On 13 December 1946, the Constituent Assembly formally commenced its task of framing the Constitution of India. Jawaharlal Nehru moved the Objectives Resolution, which aimed to declare India as an Independent Sovereign Republic and create a Constitution to govern its future. On January 26, 1950, the Constituent Assembly adopted the Constitution of India",
  },
  {
    link: "/loksabha-fight.jpeg",
    type: "image",
    title: "What does the Lok Sabha do?",
    caption:
      "The Lok Sabha, constitutionally the House of the People, is the lower house of India's bicameral Parliament, with the upper house being the Rajya Sabha. Members of the Lok Sabha are elected by an adult universal suffrage and a first-past-the-post system to represent their respective constituencies, and they hold their seats for five years or until the body is dissolved by the President on the advice of the council of ministers. The house meets in the Lok Sabha Chambers of the Parliament House, New Delhi. ",
  },
  {
    type: "text",
    title: "How best do you frame a question?",
    text: questions,
    caption:
      "How do we pose a question that contains a certain vagueness of time and space? It must hint at a core question that need not be restricted to events in time, but even values.",
  },
];

export const themes = [
    {
      title: "Environmental impact of infrastructure",
      terms: ["environment impact assessment", "EIA", "पर्यावरण", "forest clearance", "biodiversity"],
      image: "stage1-1.jpeg",
      query: "environment impact assessment infrastructure",
    },
    {
      title: "Electoral reform and voting systems",
      terms: ["first past the post", "proportional representation", "मतदान", "electoral reform", "election commission"],
      image: "stage1-1.jpeg",
      query: "electoral reform voting first past the post",
    },
    {
      title: "Panchayat and local governance",
      terms: ["panchayati raj", "gram sabha", "पंचायत", "local self-government", "municipal elections"],
      image: "stage1-1.jpeg",
      query: "panchayat gram sabha local government",
    },
    {
      title: "Public healthcare spending",
      terms: ["health budget", "स्वास्थ्य", "AYUSHMAN", "hospital funding", "public health"],
      image: "stage1-1.jpeg",
      query: "healthcare spending budget public health",
    },
    {
      title: "The powers of a Governor",
      terms: ["राज्यपाल", "governor powers", "President's Rule", "Article 356", "constitutional role"],
      image: "stage1-1.jpeg",
      query: "governor powers constitutional President rule",
    },
    {
      title: "Caste in census and enumeration",
      terms: ["जाति जनगणना", "OBC enumeration", "backward classes", "social classification", "caste census"],
      image: "stage1-1.jpeg",
      query: "caste census enumeration backward classes",
    },
    {
      title: "Urban cycling and mobility",
      terms: ["cycle lanes", "non-motorised transport", "साइकिल", "urban mobility", "green transport"],
      image: "stage1-1.jpeg",
      query: "cycling infrastructure urban non-motorised transport",
    },
    {
      title: "Urbanisation across states",
      terms: ["urban growth", "नगरीकरण", "migration", "smart cities", "municipal governance"],
      image: "stage1-1.jpeg",
      query: "urbanisation cities states migration",
    },
    {
      title: "Investment in education",
      terms: ["शिक्षा", "NEP", "education budget", "school funding", "higher education"],
      image: "stage1-1.jpeg",
      query: "education investment budget NEP",
    },
    {
      title: "Loss of wildlife and habitat",
      terms: ["वन्यजीव", "tiger reserve", "endangered species", "habitat loss", "wildlife protection"],
      image: "stage1-1.jpeg",
      query: "wildlife loss endangered species habitat",
    },
    {
      title: "Subsidised and free education",
      terms: ["RTE", "छात्रवृत्ति", "free schooling", "scholarship", "education subsidy"],
      image: "stage1-1.jpeg",
      query: "subsidised free education scholarship RTE",
    },
    {
      title: "Right to information",
      terms: ["RTI", "सूचना का अधिकार", "transparency", "public disclosure", "whistleblower"],
      image: "stage1-1.jpeg",
      query: "right to information RTI transparency",
    },
    {
      title: "Rural employment guarantee",
      terms: ["MGNREGA", "मनरेगा", "NREGA", "rural wages", "employment guarantee"],
      image: "stage1-1.jpeg",
      query: "MGNREGA rural employment guarantee wages",
    },
    {
      title: "Taxation of the wealthy",
      terms: ["wealth tax", "कर", "income tax", "capital gains", "super rich levy"],
      image: "stage1-1.jpeg",
      query: "taxation wealth income inequality",
    },
    {
      title: "Railway infrastructure and budget",
      terms: ["रेलवे", "rail budget", "passenger services", "freight", "station modernisation"],
      image: "stage1-1.jpeg",
      query: "railway infrastructure budget spending",
    },
    {
      title: "Land redistribution and reform",
      terms: ["भूमि सुधार", "land ceiling", "zamindari abolition", "land acquisition", "tenancy reform"],
      image: "stage1-1.jpeg",
      query: "land redistribution reform ceiling zamindari",
    },
    {
      title: "Censorship and press freedom",
      terms: ["सेंसरशिप", "Article 19", "sedition", "media freedom", "press freedom"],
      image: "stage1-1.jpeg",
      query: "censorship press freedom Article 19 media",
    },
    {
      title: "Youth radicalisation",
      terms: ["extremism", "युवा", "terror financing", "community harmony", "deradicalisation"],
      image: "stage1-1.jpeg",
      query: "radicalisation youth extremism",
    },
  ];