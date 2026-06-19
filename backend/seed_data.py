import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sqlalchemy import text
from .database import engine

def seed_database():
    if not engine:
        print("Database engine not initialized. Please check credentials.")
        return

    print("Generating synthetic products...")
    products = [
        {"product_id": 1, "name": "Enterprise Analytics Suite", "price": 5000.0, "category": "Software"},
        {"product_id": 2, "name": "Cloud Storage 1TB", "price": 120.0, "category": "Infrastructure"},
        {"product_id": 3, "name": "Cybersecurity Audit", "price": 15000.0, "category": "Services"},
        {"product_id": 4, "name": "AI Copilot License", "price": 300.0, "category": "Software"}
    ]
    df_products = pd.DataFrame(products)

    print("Generating synthetic sales data (2 years)...")
    np.random.seed(42)
    start_date = datetime(2024, 1, 1)
    end_date = datetime(2026, 6, 1)
    date_range = pd.date_range(start_date, end_date, freq='D')
    
    regions = ["North America", "Europe", "Asia-Pacific", "Latin America"]
    
    sales_data = []
    transaction_id = 1
    
    for d in date_range:
        # Base daily transactions: 50 to 150
        num_transactions = np.random.randint(50, 150)
        
        # Seasonality: higher sales in Q4 (Oct, Nov, Dec)
        if d.month in [10, 11, 12]:
            num_transactions = int(num_transactions * 1.5)
            
        # Growth trend: general upward trend over the years
        days_passed = (d - start_date).days
        trend_multiplier = 1 + (days_passed / 730) * 0.5
        num_transactions = int(num_transactions * trend_multiplier)

        for _ in range(num_transactions):
            product = np.random.choice(products)
            region = np.random.choice(regions, p=[0.4, 0.3, 0.2, 0.1])
            quantity = np.random.randint(1, 10)
            
            # Anomaly: Asia-Pacific sees a huge spike for AI Copilot in early 2026
            if region == "Asia-Pacific" and product["product_id"] == 4 and d.year == 2026 and d.month <= 3:
                quantity = int(quantity * 3)

            sales_data.append({
                "id": transaction_id,
                "date": d.date(),
                "product_id": product["product_id"],
                "region": region,
                "quantity": quantity,
                "revenue": quantity * product["price"],
                "category": product["category"]
            })
            transaction_id += 1

    df_sales = pd.DataFrame(sales_data)
    
    print(f"Generated {len(df_sales)} sales records.")

    print("Writing to PostgreSQL database...")
    try:
        with engine.connect() as conn:
            # Drop existing tables to start fresh
            conn.execute(text("DROP TABLE IF EXISTS sales CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS products CASCADE;"))
            conn.commit()

        # Write to SQL
        df_products.to_sql('products', engine, index=False, if_exists='replace')
        df_sales.to_sql('sales', engine, index=False, if_exists='replace')
        
        # Adding primary/foreign keys (Optional but good practice)
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE products ADD PRIMARY KEY (product_id);"))
            conn.execute(text("ALTER TABLE sales ADD PRIMARY KEY (id);"))
            # Optionally add foreign key constraints
            conn.commit()

        print("Successfully seeded the database!")
    except Exception as e:
        print(f"Error writing to database: {e}")

if __name__ == "__main__":
    seed_database()
