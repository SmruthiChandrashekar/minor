# create_database.py (FREE VERSION)

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import WebBaseLoader
import os
import shutil

CHROMA_PATH = "chroma"
DATA_PATH = "data/hr_policies"


def main():
    generate_data_store()


def generate_data_store():
    documents = load_documents()
    chunks = split_text(documents)
    save_to_chroma(chunks)


def load_documents():
    documents = []

    # 🔹 1. LOAD PDFs (existing)
    for filename in os.listdir(DATA_PATH):
        file_path = os.path.join(DATA_PATH, filename)   # 🔥 FIX

        if filename.endswith(".pdf"):
            loader = PyPDFLoader(file_path)
            documents.extend(loader.load())

        elif filename.endswith(".txt"):
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
                documents.append(Document(page_content=text, metadata={"source": filename}))

    print(f"Loaded {len(documents)} pages from PDFs.")

    # 🔹 2. LOAD WEBSITES (NEW 🔥)
    urls = [
        "https://www.puravankara.com/",
        "https://www.linkedin.com/company/puravankara/"
    ]

    web_loader = WebBaseLoader(urls)
    web_docs = web_loader.load()

    print(f"Loaded {len(web_docs)} web documents.")

    documents.extend(web_docs)

    return documents


def split_text(documents: list[Document]):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100,
    )

    chunks = text_splitter.split_documents(documents)
    print(f"Split {len(documents)} pages into {len(chunks)} chunks.")

    return chunks


def save_to_chroma(chunks: list[Document]):
    if os.path.exists(CHROMA_PATH):
        shutil.rmtree(CHROMA_PATH)

    embedding_model = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )

    db = Chroma.from_documents(
        chunks,
        embedding_model,
        persist_directory=CHROMA_PATH,
    )

    db.persist()
    print(f"Saved {len(chunks)} chunks to '{CHROMA_PATH}'.")


if __name__ == "__main__":
    main()