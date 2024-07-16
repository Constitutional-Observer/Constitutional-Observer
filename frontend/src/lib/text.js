import texts from "./questions.txt?raw";

let getQuestions = async () => {
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

export let questions = await getQuestions();
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
    text: await questions,
    caption:
      "How do we pose a question that contains a certain vagueness of time and space? It must hint at a core question that need not be restricted to events in time, but even values.",
  },
];
