# Use Python base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy only the backend folder
COPY backend/ /app/

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port
EXPOSE 8000

# Start the FastAPI application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

