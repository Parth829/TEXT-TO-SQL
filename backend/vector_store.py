import chromadb
from typing import List, Dict, Any, Optional

# Initialize ChromaDB in-memory or local persistent
chroma_client = chromadb.PersistentClient(path="./chroma_db")

# Create or get collections
schema_collection = chroma_client.get_or_create_collection(name="db_schemas")
glossary_collection = chroma_client.get_or_create_collection(name="business_glossary")

# --- In-Memory Cache for fast lookups (bypasses vector search for small schemas) ---
_SCHEMA_CACHE: Dict[str, str] = {}
_GLOSSARY_CACHE: Dict[str, str] = {}

# --- Structured metadata for governance & SQL validation ---
_TABLE_METADATA: Dict[str, Dict[str, Any]] = {}
# Maps table_name -> {"columns": ["col1", "col2"], "owner": ..., "sensitivity": ...}


def add_schema_info(
    table_name: str,
    schema_description: str,
    columns: List[Dict[str, str]],
    owner: Optional[str] = None,
    business_definition: Optional[str] = None,
    sample_queries: Optional[List[str]] = None,
    sensitivity: Optional[str] = None,
):
    """
    Adds table schema info to the vector store, in-memory cache, AND structured metadata.
    
    columns: list of dicts like [{"name": "revenue", "type": "numeric", "description": "Total revenue"}]
    owner: team/department that owns this table (e.g. "finance")
    business_definition: plain-English definition (e.g. "completed purchase")
    sample_queries: example SQL questions users might ask
    sensitivity: data classification (e.g. "PII", "internal", "public")
    """
    doc = f"Table: {table_name}\n"
    if owner:
        doc += f"Owner: {owner}\n"
    if business_definition:
        doc += f"Business Definition: {business_definition}\n"
    if sensitivity:
        doc += f"Data Sensitivity: {sensitivity}\n"
    doc += f"Description: {schema_description}\nColumns:\n"
    for col in columns:
        doc += f"- {col['name']} ({col['type']}): {col['description']}\n"
    if sample_queries:
        doc += "Sample Questions:\n"
        for sq in sample_queries:
            doc += f"  - {sq}\n"

    # Populate in-memory text cache (for LLM context)
    _SCHEMA_CACHE[table_name] = doc

    # Populate structured metadata (for SQL validation)
    _TABLE_METADATA[table_name] = {
        "columns": [col["name"] for col in columns],
        "owner": owner,
        "sensitivity": sensitivity,
        "business_definition": business_definition,
    }

    # Also write to ChromaDB for larger-scale use
    meta = {"table": table_name}
    if owner:
        meta["owner"] = owner
    if sensitivity:
        meta["sensitivity"] = sensitivity
    schema_collection.upsert(
        documents=[doc],
        metadatas=[meta],
        ids=[f"schema_{table_name}"],
    )


def add_business_glossary(term: str, definition: str, logic: str):
    """Adds KPI definitions and business terms to both cache and vector store."""
    doc = f"Term: {term}\nDefinition: {definition}\nLogic: {logic}"

    _GLOSSARY_CACHE[term] = doc

    glossary_collection.upsert(
        documents=[doc],
        metadatas=[{"term": term}],
        ids=[f"term_{term.replace(' ', '_')}"],
    )


def get_all_schema_context() -> str:
    """
    Returns ALL schema and glossary descriptions concatenated from cache.
    Fast path for small schemas — no embedding/vector search needed.
    """
    context = "Database Schemas:\n"
    for doc in _SCHEMA_CACHE.values():
        context += f"\n{doc}\n"

    context += "\nBusiness Glossary:\n"
    for doc in _GLOSSARY_CACHE.values():
        context += f"\n{doc}\n"

    return context


def get_table_metadata() -> Dict[str, Dict[str, Any]]:
    """Returns structured table metadata for SQL validation (table names, column names)."""
    return _TABLE_METADATA


def search_schema(query: str, n_results: int = 3) -> str:
    """Searches for relevant schemas based on the natural language query."""
    if len(_SCHEMA_CACHE) <= 10:
        context = "Relevant Database Schemas:\n"
        for doc in _SCHEMA_CACHE.values():
            context += f"\n{doc}\n"
        return context

    try:
        results = schema_collection.query(query_texts=[query], n_results=n_results)
        context = "Relevant Database Schemas:\n"
        if results["documents"] and len(results["documents"][0]) > 0:
            for doc in results["documents"][0]:
                context += f"\n{doc}\n"
        return context
    except Exception as e:
        print(f"Schema search error: {e}")
        return "No schema context found."


def search_glossary(query: str, n_results: int = 2) -> str:
    """Searches for relevant KPI definitions."""
    if len(_GLOSSARY_CACHE) <= 10:
        context = "Relevant Business Glossary:\n"
        for doc in _GLOSSARY_CACHE.values():
            context += f"\n{doc}\n"
        return context

    try:
        results = glossary_collection.query(query_texts=[query], n_results=n_results)
        context = "Relevant Business Glossary:\n"
        if results["documents"] and len(results["documents"][0]) > 0:
            for doc in results["documents"][0]:
                context += f"\n{doc}\n"
        return context
    except Exception as e:
        print(f"Glossary search error: {e}")
        return "No glossary context found."


def _warm_cache():
    """Loads existing ChromaDB documents into the in-memory cache on startup."""
    try:
        schema_docs = schema_collection.get()
        if schema_docs and schema_docs["documents"]:
            for i, doc in enumerate(schema_docs["documents"]):
                meta = schema_docs["metadatas"][i] if schema_docs["metadatas"] else {}
                table_name = meta.get("table", f"table_{i}")
                _SCHEMA_CACHE[table_name] = doc
                # Reconstruct _TABLE_METADATA from the document text
                cols = []
                for line in doc.split("\n"):
                    if line.startswith("- ") and "(" in line:
                        col_name = line.split("- ")[1].split(" (")[0].strip()
                        cols.append(col_name)
                _TABLE_METADATA[table_name] = {
                    "columns": cols,
                    "owner": meta.get("owner"),
                    "sensitivity": meta.get("sensitivity"),
                    "business_definition": None,
                }

        glossary_docs = glossary_collection.get()
        if glossary_docs and glossary_docs["documents"]:
            for i, doc in enumerate(glossary_docs["documents"]):
                meta = glossary_docs["metadatas"][i] if glossary_docs["metadatas"] else {}
                term = meta.get("term", f"term_{i}")
                _GLOSSARY_CACHE[term] = doc
    except Exception as e:
        print(f"Cache warm-up error: {e}")


# Pre-populate with sample data for demonstration if empty
def init_sample_data():
    try:
        if schema_collection.count() == 0:
            add_schema_info(
                table_name="sales",
                schema_description="Contains all historical sales transactions.",
                owner="finance",
                business_definition="A completed purchase transaction recorded at POS or online.",
                sensitivity="internal",
                sample_queries=[
                    "Show total revenue by region",
                    "What were monthly sales last quarter?",
                    "Which product category has the highest demand?",
                ],
                columns=[
                    {"name": "id", "type": "int", "description": "Transaction ID"},
                    {"name": "date", "type": "date", "description": "Date of sale"},
                    {"name": "product_id", "type": "int", "description": "ID of product sold"},
                    {"name": "region", "type": "varchar", "description": "Region of sale (e.g., North India)"},
                    {"name": "quantity", "type": "int", "description": "Number of items sold"},
                    {"name": "revenue", "type": "numeric", "description": "Total revenue from sale"},
                    {"name": "category", "type": "varchar", "description": "Product category"},
                ],
            )
            add_schema_info(
                table_name="products",
                schema_description="Product catalog.",
                owner="product_ops",
                business_definition="Master list of all sellable items.",
                sensitivity="public",
                sample_queries=["List all products", "What is the price of Product A?"],
                columns=[
                    {"name": "product_id", "type": "int", "description": "Product ID"},
                    {"name": "name", "type": "varchar", "description": "Product name (e.g., Product A)"},
                    {"name": "price", "type": "numeric", "description": "Current price"},
                ],
            )

            add_business_glossary(
                term="Demand",
                definition="The total quantity of a product expected to be sold.",
                logic="SUM(quantity) FROM sales",
            )
            add_business_glossary(
                term="Gross Revenue",
                definition="Total revenue before any deductions.",
                logic="SUM(revenue) FROM sales",
            )
            add_business_glossary(
                term="Net Revenue",
                definition="Revenue after deducting returns and discounts.",
                logic="SUM(revenue) - SUM(returns) FROM sales (returns column if exists)",
            )
        else:
            _warm_cache()
    except Exception as e:
        print(f"Error initializing sample data: {e}")


init_sample_data()
