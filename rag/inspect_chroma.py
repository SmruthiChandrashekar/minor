from chromadb import PersistentClient

client = PersistentClient(path="chroma")
collection = client.get_collection("langchain")

print("\nTotal Stored Documents:", collection.count())

# IMPORTANT: ask for embeddings explicitly
sample = collection.get(
    limit=3,
    include=["documents", "metadatas", "embeddings"]
)

print("\nSample Stored Data:\n")

for i in range(len(sample["documents"])):
    print("Document:", sample["documents"][i])
    print("Metadata:", sample["metadatas"][i])
    print("Vector Length:", len(sample["embeddings"][i]))
    print("-" * 50)