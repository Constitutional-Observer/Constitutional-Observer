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
    "./data/constituent-assembly/debates-embeddings"
).add_faiss_index(column="embeddings")
hwdfEmbeddings = Dataset.load_from_disk("./data/hwdb/hwdb-embeddings").add_faiss_index(
    column="embeddings"
)
sabhaQuestionsEmbeddings = Dataset.load_from_disk(
    "./data/sabha/sabha-embeddings-english-2"
).add_faiss_index(column="embeddings")
courtJudgementsEmbeddings = Dataset.load_from_disk(
    "./data/court-judgements/supreme-court-embeddings"
).add_faiss_index(column="embeddings")


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
        "embeddings", question_embedding, k=5
    )

    del question_embedding
    gc.collect()

    samples_df = pd.DataFrame.from_dict(samples)
    samples_df["scores"] = scores
    samples_df.sort_values("scores", ascending=False, inplace=True)
    samples_df["content"] = samples_df["content"].apply(
        lambda x: re.sub("{'rendered':", "", x)
    )
    samples_df = samples_df[samples_df["scores"] > 35]
    return samples_df.to_dict(orient="records")


# @app.route("/hwdb/", methods=["GET"])
# def getHwdb():
#     args = request.args
#     query = args.get("query")
#     question_embedding = get_embeddings([query]).cpu().detach().numpy()

#     scores, samples_df = hwdfEmbeddings.get_nearest_examples(
#         "embeddings", question_embedding, k=5
#     )

#     del question_embedding
#     gc.collect()

#     samples_df = pd.DataFrame.from_dict(samples_df)
#     samples_df["scores"] = scores
#     samples_df.sort_values("scores", ascending=False, inplace=True)

#     return samples_df.to_dict(orient="records")


@app.route("/sabha/", methods=["GET"])
def getSabha():
    args = request.args
    query = args.get("query")
    question_embedding = get_embeddings([query]).cpu().detach().numpy()

    scores, samples_df = sabhaQuestionsEmbeddings.get_nearest_examples(
        "embeddings", question_embedding, k=10
    )

    del question_embedding
    gc.collect()
    samples_df = pd.DataFrame.from_dict(samples_df)
    samples_df["scores"] = scores
    samples_df.sort_values("scores", ascending=False, inplace=True)
    samples_df = samples_df[samples_df["scores"] > 35]
    return samples_df.to_dict(orient="records")


@app.route("/courts/", methods=["GET"])
def getCourts():
    args = request.args
    query = args.get("query")
    question_embedding = get_embeddings([query]).cpu().detach().numpy()

    scores, samples_df = courtJudgementsEmbeddings.get_nearest_examples(
        "embeddings", question_embedding, k=10
    )

    del question_embedding
    gc.collect()
    samples_df = pd.DataFrame.from_dict(samples_df)
    samples_df["scores"] = scores
    samples_df.sort_values("scores", ascending=False, inplace=True)
    samples_df = samples_df[samples_df["scores"] > 35]
    return samples_df.to_dict(orient="records")


if __name__ == "__main__":
    app.run()
