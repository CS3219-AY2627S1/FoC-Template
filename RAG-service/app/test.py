from app.claude import ClaudeClient
from app.retrieval import Retriever


def main() -> None:
    query = "How are credits transferred to a courier?"

    retriever = Retriever()
    chunks = retriever.find_relevant_chunks(query)

    claude = ClaudeClient()
    answer = claude.answer(query, chunks)

    print(answer)


if __name__ == "__main__":
    main()
