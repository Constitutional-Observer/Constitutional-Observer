## Note

![Photograph of installation](./installation-1.jpeg)
_This project is meant to be exhibited alongside a print installation. It is being exhibited at the Srishti Manipal campus in Yelahanka, Bengaluru on the 25th and 26th of May, 2024._

How do people, as citizens, question the government? Holding the government accountable is one of the primary parliamentary roles of the opposition. However, as common citizens, we do not know much of how the Parliament functions. The realities of our democracy means there are always people who are ignored, sidelined, pushed, reduced and small-cased. What protects their rights?

Those being marginalised exist across a spectrum. There are grave threats to their lives, and there is a slow erosion of their rights. The erosion may be in many ways: In marriage laws, in their right to drink water, in the lack of food availability or in their right to pray.

How have the makers of the Constitution dealt with these? How does the Parliament deal with it? How do people come together to demand? This exhibit explores the making of these questions: What should we question? And how best do we begin questioning? The experiences woven into the web-platform allow you to do that — Question more, Question deeply.

## Acknowledgements

### Constituent Assembly Debates

The Constituent Assembly Debates have been collated, annotated and archived by the [Constitutional Culture team at the Centre for Law and Policy Research (CLPR), Bangalore](https://clpr.org.in/), at [Constitutionofindia.net](constitutionofindia.net).

Their work has been critical to the making and realisation of this project. I thank the team for their work. The Observer extensively used their archive of the Constituent Assembly debates.

\[Disclaimer: CLPR is not directly involved in this project\]

### Lok Sabha Questions

Lok Sabha Questions have been scraped from over 3 lakh PDFs downloaded from sansad.in and other sources, made possible by the [india-representatives-watch repository](https://github.com/Vonter/india-representatives-activity/). It is distributed under the ODbL licence. That repository is sourced from [PRS India](https://prsindia.org).

### Free and Open Source Software

This project has mostly been created out of Free and Open Source Software (FOSS). From Inkscape for the print installation, to the machine learning library that creates the embeddings, to the Linux server it runs on.

## How does the search engine work?

Both debates and questions are indexed in a database that a machine learning model creates an embedding out of. An embedding is a machine representation of text. It can be used to capture semantic relationships between text documents, which is what allows the search engine to understand the questions and respond with relevant answers. In this case, the model that has created the embedding is trained to create embeddings that respond to questions. This is called an [Asymmetric Semantic Search](https://www.sbert.net/examples/applications/semantic-search/README.html#symmetric-vs-asymmetric-semantic-search).

### Data Notes

- Currently, Hindi responses contained in the Lok Sabha Questions are not included. Translations are unavailable in the Question and Answer PDFs, and are only released in the proceedings of the day which are published in Original, Hindi and English. Those proceedings are hard to make into machine readable data (They have to be reliably split into sections), and so have been excluded for the time being.

- The Constituent Assembly Debates have been split into paragraphs by the CLPR team and hence make creating embeddings a whole lot simpler. However, many paragraphs need not be included in the search results as they are simply lists of names for example. These need to be annotated and possibly filtered out.

- Lok Sabha questions and answers have not been reliably split, as they are contained in PDFs. Currently the entire text is fed into the model. We are likely to achieve better results once the questions and answers have been split and cleaned up.

- Currently, a subset of questions from the last 15 years is being served instead of the full corpus. The full corpus will be available in the future.

## Directions forward

This project is open to critical feedback and collaborations. Largely following:

1. Curating/tagging and reviewing paragraphs from the debates then use it for improving search inside the Observer. Then, release a Dataset that other public spirited individuals/organisations can use
2. Understanding the documentation of Lok Sabha debates better and actually obtain paragraphs of debates instead of Questions and Answers as is used in the Observer. This also opens up possibilities of research into the debates to a larger audience, as PDF daily logs can be hard to parse into machine understandable formats.
3. Explore more public spaces to exhibit the print installation. The installation appears to have drawn many curious observers, and I believe there is value in exploring public spaces in the city as possible locations for the exhibit.
4. Explore the possibility of multilingual questions, since it appears quite possible for both the installation and the Observer to reach a wider audience with Kannada, Tamil, Hindi or other language based questions
