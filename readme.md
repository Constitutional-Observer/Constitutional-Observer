# Constitutional Discourses Observer

How do people, as citizens, question the government? Holding the government accountable is one of the primary parliamentary roles of the opposition. However, as common citizens, we do not know much of how the Parliament functions. The realities of our democracy means there are always people who are ignored, sidelined, pushed, reduced and small-cased. What protects their rights? (...)

Read the full description at ![the description page](https://constitutional.observer/about)

![Homepage](./assets/homepage.png)

![View of search results](./assets/resultspage.png)

## Technical overview

1. Two corpuses of text have been used to create the Observer. 
   1. One is the text of the debates in the Constituent Assembly, which met between 1948 and 1950. 
   2. The other is the text of the debates in the Lok Sabha from 1985 to 2019
2. These questions are then used to create text embeddings that serve as the basis for the semantic search engine.
   1. This is built by semantic chunking first (for the Lok Sabha corpus) and then embeddings created using the  `multi-qa-mpnet-base-dot-v1` model and the transformers library. Shoutout to Huggingface and Datasets
3. A flask server uses the FAISS indices created off of the embeddings to serve results.
4. The frontend is built with Sveltekit

## Repository Structure

This is a monorepo containing data preparation scripts, frontend and backend code.

1. Data preparation scripts are in the `scripts` folder
   1. `create_embeddings.qmd` contains the code to create text embeddings that serve as the basis of the semantic search engine
   2. `scrape.qmd` contains the code to scrape the data (from multiple sources)
2. `frontend` hosts the Sveltekit frontend
3. `server.py` hosts the Flask server

## How to develop

1. `cd frontend && yarn dev ` will start the frontend development server.
2. `python3 server.py` will start a local Flask server on port 5000.

## Roadmap

### Immediate concerns

1. Immersive landing page experience into the Constituent Assembly Debates
2. More interesting and simpler ways to add context to search results

## Data sources and acknowlegements

1. Constituent Assembly Debates have been sourced from the work of [Constitutionofindia.net](https://www.constitutionofindia.net/). The data was conveniently sourced from their site in the required format due to their efforts. Constitution of India is a project by the [Center for Law and Policy Research, Bangalore](https://clpr.org.in).

2. Lok Sabha Questions have been scraped from over 3 lakh PDFs downloaded from [sansad.in](sansad.in) and other sources, made possible by the work of Vonter at the [india-representatives-watch repository](https://github.com/Vonter/india-representatives-activity/). It is distributed under the ODbL lisence. That repository is sourced from [PRS India](https://prsindia.org).

3. Lok Sabha Debates were scraped from eparllib.nic.in from 1985 to 2019. 
