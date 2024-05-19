import texts from "./questions.txt?raw";

let getQuestions = async () => {
  // Construct a text array, with 10 elements from text file
  let fullText = texts.split("\n");

  //remove empty lines
  fullText = fullText.filter((x) => x !== "");

  let textArray = new Array();

  // Split the text into chunks of 40 elements each and store each chunk in a row of the 2D array
  let chunkSize = 300;
  let chunkCount = 100;
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

// export let text = [
//   [
//     "Who should the nation pray to?",
//     "Where do our leaders come from?",
//     "Who must the economy feed?",
//     "What can we dream?",
//     "What should we read?",
//     "What may the government know?",
//     "What may the government say?",
//     "Who are our future leaders?",
//     "Who must we read?",
//     "Who should our children pray to?",
//   ],
//   [
//     "What must our children read?",
//     "What must our children do?",
//     "Who may educate our children?",
//     "What will our children learn?",
//     "Who wrote our history?",
//     "What language should our children speak?",
//     "Where do we come from?",
//     "What language can our children speak?",
//     "What must our leaders speak?",
//     "Where must our leaders come from?",
//   ],
//   [
//     "What will history talk about?",
//     "Who do our children learn about?",
//     "Who is precious to our history?",
//     "Why is history precious?",
//     "Why is history important?",
//     "What will our children learn?",
//     "What have children learnt before?",
//     "Which children have learnt?",
//     "Who decides which children learn?",
//     "Who decides who learns what?",
//   ],
//   [
//     "Who is our family?",
//     "Who should I marry?",
//     "Who should I have children with?",
//     "What may take care of us?",
//     "What may gift peace to us?",
//     "What must be heard?",
//     "What must we answer?",
//     "What is precious to us?",
//     "What is precious to the state?",
//     "Who do our leaders pray to?",
//   ],
//   [
//     "What do our leaders pray for?",
//     "What is precious to the nation?",
//     "What is precious to our leaders?",
//     "Why do familes need visas?",
//     "Whose kisses need visas",
//     "Whose kisses need lisences",
//     "Which marriages need papers",
//     "Which lives need papers",
//     "Whose lives are not questioned",
//     "Who have addresses",
//   ],
//   [
//     "Who is benovelent?",
//     "Are our skies benovelent?",
//     "Why do we need the benovelent?",
//     "Who may drink our water?",
//     "Where may our rivers flow?",
//     "Who draws our rivers?",
//     "Who draws from our rivers?",
//     "What is priceless?",
//     "Who blesses our lands?",
//     "Who blesses our summers ?",
//   ],
//   [
//     "Who may gift peace to us?",
//     "How may we integrate them?",
//     "Who may govern us?",
//     "Who may govern them?",
//     "How may we govern?",
//     "When may we rise?",
//     "How may we come together ?",
//     "Who may drink our water?",
//     "Where may our rivers flow?",
//     "Who draws our rivers?",
//   ],
//   [
//     "Who draws from our rivers?",
//     "Who may govern us?",
//     "Who may govern them?",
//     "How may we govern?",
//     "How may order be brought upon?",
//     "How may we integrate us?",
//     "How may we integrate them?",
//     "Who may govern us?",
//     "Who may govern them?",
//     "How may we govern?",
//   ],
// ];

export let text2 = ["Who should the nation pray to?"];
export let text1 = [];
export let images = [
  {
    link: "/stage1-1.jpeg",
    type: "image",
    title: "What was the Constituent Assembly?",
    caption:
      "On 13 December 1946, the Constituent Assembly formally commenced its task of framing the Constitution of India. Jawaharlal Nehru moved the Objectives Resolution, which aimed to declare India as an Independent Sovereign Republic and create a Constitution to govern its future. The Resolution established general principles to guide the work of the Constituent Assembly. On January 22, 1947, the Constituent Assembly adopted the Resolution",
  },
  {
    link: "/loksabha-fight.jpeg",
    type: "image",
    title: "What does the Lok Sabha do?",
    caption:
      "The Lok Sabha, constitutionally the House of the People, is the lower house of India's bicameral Parliament, with the upper house being the Rajya Sabha. Members of the Lok Sabha are elected by an adult universal suffrage and a first-past-the-post system to represent their respective constituencies, and they hold their seats for five years or until the body is dissolved by the President on the advice of the council of ministers. The house meets in the Lok Sabha Chambers of the Parliament House, New Delhi. ",
  },
];
