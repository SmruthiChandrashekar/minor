# create_database.py — Policy-only RAG Ingestion Pipeline

import os
import re
import shutil
import zipfile
import xml.etree.ElementTree as ET
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_final")
DATA_PATH = os.path.join(BASE_DIR, "data", "hr_policies")


def extract_docx_text(file_path: str) -> str:
    """Extract plain text from .docx file using standard zipfile and xml parsing."""
    try:
        with zipfile.ZipFile(file_path) as z:
            xml_content = z.read('word/document.xml')
        root = ET.fromstring(xml_content)
        text_pieces = []
        for elem in root.iter():
            if elem.tag.endswith('}t') and elem.text:
                text_pieces.append(elem.text)
            elif elem.tag.endswith('}p'):
                text_pieces.append('\n')
        return ''.join(text_pieces)
    except Exception as e:
        print(f"Error reading docx {file_path}: {e}")
        return ""


def clean_text(text: str) -> str:
    """Clean obvious extraction noise while preserving substantive text and structure."""
    if not text:
        return ""
    text = text.replace("\x00", "")
    text = re.sub(r'\r\n|\r', '\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def extract_section_header(text: str) -> str:
    """Extract prominent section title/heading from beginning of text chunk if available."""
    patterns = [
        r'^[0-9]+\.\s*([A-Z0-9\s\&\(\)\-\,\/]{3,60})$',
        r'^\s*([A-Z\s\&\(\)\-\,\/]{4,50}):',
        r'^\s*([A-Z0-9\s\&\(\)\-\,\/]{4,50})\s*$'
    ]
    lines = text.split('\n')
    for line in lines[:5]:
        line_clean = line.strip()
        if not line_clean:
            continue
        for p in patterns:
            m = re.match(p, line_clean)
            if m:
                sec = m.group(1).strip()
                if len(sec) >= 3 and not sec.startswith("DOCUMENT") and not sec.startswith("PAGE"):
                    return sec
    return ""


def load_documents():
    """Load only policy documents from rag/data/hr_policies/."""
    documents = []
    if not os.path.exists(DATA_PATH):
        print(f"Directory {DATA_PATH} does not exist!")
        return documents

    files = sorted(os.listdir(DATA_PATH))
    for filename in files:
        file_path = os.path.join(DATA_PATH, filename)

        # Ignore directories, hidden files, requirements.txt, or non-policy assets
        if os.path.isdir(file_path) or filename.startswith(".") or filename.lower() == "requirements.txt":
            continue

        policy_name = os.path.splitext(filename)[0]
        policy_name = re.sub(r'[\_\-]+', ' ', policy_name).strip()

        if filename.lower().endswith(".pdf"):
            try:
                loader = PyPDFLoader(file_path)
                loaded_docs = loader.load()
                for d in loaded_docs:
                    raw_page = d.metadata.get("page", 0)
                    human_page = raw_page + 1 if isinstance(raw_page, int) else 1
                    cleaned_content = clean_text(d.page_content)
                    if not cleaned_content:
                        continue
                    section = extract_section_header(cleaned_content)

                    doc_obj = Document(
                        page_content=cleaned_content,
                        metadata={
                            "policy_name": policy_name,
                            "source_file": filename,
                            "source": filename,
                            "page": human_page,
                            "section": section
                        }
                    )
                    documents.append(doc_obj)
            except Exception as e:
                print(f"Error reading PDF {filename}: {e}")

        elif filename.lower().endswith(".docx"):
            raw_text = extract_docx_text(file_path)
            cleaned_content = clean_text(raw_text)
            if cleaned_content:
                section = extract_section_header(cleaned_content)
                doc_obj = Document(
                    page_content=cleaned_content,
                    metadata={
                        "policy_name": policy_name,
                        "source_file": filename,
                        "source": filename,
                        "page": 1,
                        "section": section
                    }
                )
                documents.append(doc_obj)

        elif filename.lower().endswith(".txt") or filename.lower().endswith(".md"):
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    raw_text = f.read()
                cleaned_content = clean_text(raw_text)
                if cleaned_content:
                    section = extract_section_header(cleaned_content)
                    doc_obj = Document(
                        page_content=cleaned_content,
                        metadata={
                            "policy_name": policy_name,
                            "source_file": filename,
                            "source": filename,
                            "page": 1,
                            "section": section
                        }
                    )
                    documents.append(doc_obj)
            except Exception as e:
                print(f"Error reading TXT {filename}: {e}")

    print(f"Loaded {len(documents)} document pages/files from '{DATA_PATH}'.")
    return documents


def split_text(documents: list[Document]):
    """Split documents using RecursiveCharacterTextSplitter with chunk_size=1000, chunk_overlap=200."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    chunks = text_splitter.split_documents(documents)

    # Attach chunk_ids and refine section metadata per chunk
    for idx, chunk in enumerate(chunks):
        source_file = chunk.metadata.get("source_file", "unknown")
        page = chunk.metadata.get("page", 1)
        chunk.metadata["chunk_id"] = f"{source_file}_p{page}_c{idx}"

        if not chunk.metadata.get("section"):
            chunk_section = extract_section_header(chunk.page_content)
            chunk.metadata["section"] = chunk_section

    print(f"Split {len(documents)} pages into {len(chunks)} chunks (chunk_size=1000, chunk_overlap=200).")
    return chunks


def save_to_chroma(chunks: list[Document]):
    """Rebuild Chroma vector store with 1000-char policy chunks."""
    if os.path.exists(CHROMA_PATH):
        print(f"Removing old vector index at {CHROMA_PATH}...")
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
    print(f"Successfully saved {len(chunks)} chunks to '{CHROMA_PATH}'.")


def main():
    documents = load_documents()
    chunks = split_text(documents)
    save_to_chroma(chunks)


if __name__ == "__main__":
    main()