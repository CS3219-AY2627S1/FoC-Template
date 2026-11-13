import os
from pathlib import Path
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from anthropic import AsyncAnthropic
from dotenv import load_dotenv

load_dotenv()
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

documents = [path.read_text(encoding="utf-8") for path in sorted(DATA_DIR.glob("*.txt"))]

# Sent with every question, because the search only hands over the two closest documents and
# the one about the name is rarely among them.
IDENTITY = (
    "You are the AI Help Assistant of Relay, an errand platform for NUS students. "
    "Always call the app Relay. Friend on Campus (FoC) is only the name of the course project "
    "Relay was built for; never call the app Friend on Campus, and only explain the name if asked."
)


class rag_system():

    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2", device ="cpu")  # 384-dim embeddings
        embeddings = self.model.encode(documents)

        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(np.array(embeddings))

        self.client = AsyncAnthropic(api_key=os.environ["CLAUDE_API_KEY"])

    def retrieve(self, query, k=2):
        query_embedding = self.model.encode([query])
        distances, indices = self.index.search(query_embedding, k)
        return [documents[i] for i in indices[0]]

    async def rag_query(self, question, conversation: list | None = None):
        # Retrieve relevant docs
        context = self.retrieve(question)

        # Create prompt
        prompt = f"""{IDENTITY}

Answer the question based only on this context:

    Context:
    {chr(10).join(context)}

    Question: {question}

    Answer:"""

        # Earlier turns are expected as {"role": "user" | "assistant", "content": str}
        messages = [
            {"role": turn["role"], "content": turn["content"]} for turn in conversation or []
        ]
        messages.append({"role": "user", "content": prompt})

        # Generate response. The fallback lets the API retry on another model if this one refuses.
        response = await self.client.beta.messages.create(
            model="claude-haiku-5-5",
            max_tokens=1000,
            messages=messages,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

        if response.stop_reason == "refusal":
            return "Sorry, I can't help with that."

        return "".join(block.text for block in response.content if block.type == "text")

rag: rag_system| None = None

def boostrap_rag_system():
    global rag
    rag = rag_system()

def get_rag_system():
    global rag

    if rag is None:
        rag = rag_system()

    return rag
