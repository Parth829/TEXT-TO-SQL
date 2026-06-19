import os
from typing import List, Dict, Any
from sqlalchemy import create_engine, inspect, text
from .vector_store import add_schema_info

class EnterpriseDataSource:
    def __init__(self, name: str, source_type: str, connection_string: str):
        self.name = name
        self.source_type = source_type
        self.connection_string = connection_string
        self.is_connected = False
        self.engine = None
        self.metadata_cache = {}
        
    def connect(self) -> bool:
        """Connect to the actual database."""
        try:
            conn_str = self.connection_string
            if conn_str.startswith("mysql://"):
                conn_str = conn_str.replace("mysql://", "mysql+pymysql://", 1)
                
            self.engine = create_engine(conn_str)
            with self.engine.connect() as conn:
                # Test connection
                conn.execute(text("SELECT 1"))
            self.is_connected = True
            return True
        except Exception as e:
            raise Exception(f"Connection failed: {str(e)}")

    def extract_metadata(self) -> Dict[str, Any]:
        """Extracts real schema metadata from the connected database."""
        if not self.is_connected:
            raise Exception("Source not connected")
            
        inspector = inspect(self.engine)
        tables_data = []
        
        table_names = inspector.get_table_names()
        for t_name in table_names:
            cols = inspector.get_columns(t_name)
            col_data = [{"name": c["name"], "type": str(c["type"]), "description": ""} for c in cols]
            tables_data.append({
                "name": t_name,
                "description": f"Table {t_name} extracted from postgres",
                "columns": col_data
            })
            
        self.metadata_cache = {"tables": tables_data}
        return self.metadata_cache
        
    def sync_to_chroma(self):
        """Extracts metadata and syncs it to the centralized ChromaDB registry."""
        metadata = self.extract_metadata()
        for table in metadata.get("tables", []):
            add_schema_info(
                table_name=table["name"],
                schema_description=table["description"],
                columns=table["columns"]
            )
        return True

# Simple in-memory registry for connected sources
_CONNECTED_SOURCES: List[EnterpriseDataSource] = []

def add_data_source(name: str, source_type: str, connection_string: str) -> Dict[str, Any]:
    try:
        # Prevent duplicates
        for src in _CONNECTED_SOURCES:
            if src.name == name:
                return {"success": False, "error": f"A data source named '{name}' already exists."}
            if src.connection_string == connection_string:
                return {"success": False, "error": f"This database is already connected as '{src.name}'."}

        source = EnterpriseDataSource(name, source_type, connection_string)
        source.connect()
        source.sync_to_chroma()
        _CONNECTED_SOURCES.append(source)
        
        num_tables = len(source.metadata_cache.get("tables", []))
        num_cols = sum(len(t["columns"]) for t in source.metadata_cache.get("tables", []))
        
        return {
            "success": True, 
            "stats": {
                "tables": num_tables, 
                "columns": num_cols
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_data_sources() -> List[Dict[str, Any]]:
    return [
        {
            "name": src.name,
            "type": src.source_type,
            "connected": src.is_connected
        }
        for src in _CONNECTED_SOURCES
    ]

def remove_data_source(name: str) -> bool:
    global _CONNECTED_SOURCES
    initial_length = len(_CONNECTED_SOURCES)
    _CONNECTED_SOURCES = [src for src in _CONNECTED_SOURCES if src.name != name]
    return len(_CONNECTED_SOURCES) < initial_length
