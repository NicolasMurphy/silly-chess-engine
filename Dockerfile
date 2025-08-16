# Use Python 3.11 with security updates
FROM python:3.11-slim-bookworm

# Set working directory
WORKDIR /app

# Update system packages and install dependencies including Stockfish
RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create static directory if it doesn't exist
RUN mkdir -p static

# Expose port
EXPOSE 5000

# Set environment variables
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
