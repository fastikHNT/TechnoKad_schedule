import sys
sys.path.insert(0, '.')
try:
    from app import app
    print("Import OK")
except Exception as e:
    print(f"Import Error: {e}")
    import traceback
    traceback.print_exc()
