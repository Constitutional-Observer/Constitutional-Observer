import pandas as pd
import re
from transformers import AutoTokenizer, AutoModel
import torch
from datasets import Dataset
import gc

from flask import Flask, request

model_ckpt = "sentence-transformers/multi-qa-mpnet-base-dot-v1"
tokenizer = AutoTokenizer.from_pretrained(model_ckpt)
model = AutoModel.from_pretrained(model_ckpt)

device = torch.device("cpu")
model.to(device)

app = Flask(__name__)

constituentDebatesEmbeddings = Dataset.load_from_disk(
    "./data/constituent-assembly/debates-embeddings-2"
)
constituentDebatesEmbeddings.load_faiss_index("embeddings", "./data/constituent-assembly/debates-embeddings-2.faiss")

# sabhaQuestionsEmbeddings = Dataset.load_from_disk(
#     "./data/sabha/sabha-embeddings-english-4"
# ).add_faiss_index(column="embeddings")

sabhaDebatesEmbeddings = Dataset.load_from_disk(
    "./data/sabha/fullday-embeddings-english",   
)   
sabhaDebatesEmbeddings.load_faiss_index("embeddings", "./data/sabha/fullday-embeddings-english.faiss")

sabhaDebatesIndex = Dataset.load_from_disk(
    "./data/sabha/sabha-index-english",
)

def cls_pooling(model_output):
    return model_output.last_hidden_state[:, 0]


def get_embeddings(text_list):
    encoded_input = tokenizer(
        text_list, padding=True, truncation=True, return_tensors="pt"
    )
    encoded_input = {k: v.to(device) for k, v in encoded_input.items()}
    model_output = model(**encoded_input)
    return cls_pooling(model_output)


@app.route("/")
def home():
    return "Hello, World!"


@app.route("/debates/", methods=["GET"])
def getDebates():
    args = request.args
    query = args.get("query")
    question_embedding = get_embeddings([query]).cpu().detach().numpy()

    scores, samples = constituentDebatesEmbeddings.get_nearest_examples(
        "embeddings", question_embedding, k=20
    )

    del question_embedding
    gc.collect()

    samples_df = pd.DataFrame.from_dict(samples)
    samples_df.drop(columns=["embeddings"], inplace=True)

    return samples_df.to_dict(orient="records")

@app.route("/sabhadebates/", methods=["GET"])
def getSabhaDebates():
    args = request.args
    query = args.get("query")
    question_embedding = get_embeddings([query]).cpu().detach().numpy()
    scores, samples_df = sabhaDebatesEmbeddings.get_nearest_examples(
        "embeddings", question_embedding, k=20
    )

    del question_embedding
    gc.collect()
    samples_df = pd.DataFrame.from_dict(samples_df)
    samples_df.drop(columns=["embeddings"], inplace=True)
    dic = samples_df.to_dict(orient="records")

    # get the dict of keys
    # match from sabhaDebatesIndex
    for i in range(len(dic)):
        index = sabhaDebatesIndex.filter(lambda x: x['Date'] == dic[i]['Date'])
        index = pd.DataFrame.from_dict(index)
        dic[i]['index'] = index.to_dict(orient="records")

    return dic

if __name__ == "__main__":
    app.run(threaded=False)
