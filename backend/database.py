import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import pandas as pd

# Default local PostgreSQL connection, override via environment variables
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASS = os.environ.get("DB_PASS", "12345")
DB_NAME = os.environ.get("DB_NAME", "postgres")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

try:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    print(f"Failed to create database engine: {e}")
    engine = None
    SessionLocal = None

def get_db():
    if not SessionLocal:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_routing_engine(query: str):
    """Dynamically routes the query to the correct connected data source based on table names."""
    try:
        from .data_sources import _CONNECTED_SOURCES
        if not _CONNECTED_SOURCES:
            return None
            
        import sqlglot
        try:
            parsed = sqlglot.parse_one(query)
            tables = [table.name.lower() for table in parsed.find_all(sqlglot.exp.Table)]
        except:
            tables = []
            
        if not tables:
            return _CONNECTED_SOURCES[0].engine
            
        # Find which data source has these tables
        for src in _CONNECTED_SOURCES:
            src_tables = [t["name"].lower() for t in src.metadata_cache.get("tables", [])]
            # If any of the queried tables match this source, use this source's engine
            if any(t in src_tables for t in tables):
                return src.engine
                
        # Fallback to the first one if we can't match
        return _CONNECTED_SOURCES[0].engine
    except Exception as e:
        print(f"Routing error: {e}")
        return None

def enforce_read_only(query: str) -> str:
    """Checks the SQL AST to ensure it is purely a read operation."""
    import sqlglot
    try:
        parsed = sqlglot.parse_one(query)
        # Block if it's not a SELECT or CTE
        if not isinstance(parsed, (sqlglot.exp.Select, sqlglot.exp.Union)):
            return "Security Violation: Only SELECT queries are permitted."
        return None
    except Exception:
        # If sqlglot can't parse it, it might be invalid syntax, let the DB handle it
        return None

def execute_read_query(query: str):
    """Executes a read-only query and returns the results as a list of dictionaries."""
    target_engine = get_routing_engine(query) or engine
    if not target_engine:
        return {"error": "No database connected. Please connect a data source in the UI."}
        
    violation = enforce_read_only(query)
    if violation:
        return {"status": "error", "message": violation}
        
    try:
        with target_engine.connect() as conn:
            result = conn.execute(text(query))
            if result.returns_rows:
                rows = result.fetchall()
                columns = result.keys()
                data = [dict(zip(columns, row)) for row in rows]
                return {"status": "success", "data": data}
            else:
                return {"status": "error", "message": "Query did not return any rows."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def execute_read_query_df(query: str) -> pd.DataFrame:
    """Executes a query and returns a pandas DataFrame for forecasting/analysis."""
    target_engine = get_routing_engine(query) or engine
    if not target_engine:
        return pd.DataFrame({"error": ["No database connected. Please connect a data source in the UI."]})
        
    violation = enforce_read_only(query)
    if violation:
        return pd.DataFrame({"error": [violation]})
        
    try:
        with target_engine.connect() as conn:
            df = pd.read_sql(text(query), conn)
            return df
    except Exception as e:
        print(f"Query Execution Error: {e}")
        return pd.DataFrame({"error": [str(e)]})
