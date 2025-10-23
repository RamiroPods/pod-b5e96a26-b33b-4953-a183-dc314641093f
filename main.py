from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from writerai import Writer
import os
import json
from typing import Optional, AsyncGenerator

# Initialize FastAPI app
app = FastAPI(title="Text Summarizer API", version="1.0.0")

# Get CORS origins from environment variable or use defaults
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:5174").split(",")

# Add CORS middleware to allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Writer client
# You'll need to set your WRITER_API_KEY environment variable
writer_client = Writer(
    api_key=os.getenv("WRITER_API_KEY")
)

# Pydantic models for request/response
class TextSummarizeRequest(BaseModel):
    text: str
    max_length: Optional[int] = None
    style: Optional[str] = "concise"  # concise, detailed, bullet_points

class TextSummarizeResponse(BaseModel):
    summary: str
    original_word_count: int
    summary_word_count: int
    compression_ratio: float

class HealthResponse(BaseModel):
    status: str
    message: str

# Helper function to count words
def count_words(text: str) -> int:
    return len(text.strip().split())

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint to verify the API is running"""
    return HealthResponse(
        status="healthy",
        message="Text Summarizer API is running"
    )

# Text summarization endpoint
@app.post("/api/summarize", response_model=TextSummarizeResponse)
async def summarize_text(request: TextSummarizeRequest):
    """
    Summarize the provided text using Writer AI
    """
    try:
        # Validate input
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        if len(request.text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Text must be at least 50 characters long")
        
        # Count original words
        original_word_count = count_words(request.text)
        
        # Create summarization prompt based on style
        if request.style == "bullet_points":
            prompt = f"""Please summarize the following text in bullet points format. Focus on the key points and main ideas:

{request.text}

Summary (bullet points):"""
        elif request.style == "detailed":
            prompt = f"""Please provide a detailed summary of the following text, maintaining important details and context:

{request.text}

Detailed summary:"""
        else:  # concise
            prompt = f"""Please provide a concise summary of the following text, capturing the main points in a clear and brief manner:

{request.text}

Concise summary:"""
        
        # Call Writer AI for summarization using the correct method
        response = writer_client.chat.chat(
            model="palmyra-x-004",  # Use Writer's model
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=request.max_length if request.max_length else 500,
            temperature=0.3  # Lower temperature for more consistent summaries
        )
        
        # Extract the summary from the response
        summary = response.choices[0].message.content.strip()
        
        # Count summary words
        summary_word_count = count_words(summary)
        
        # Calculate compression ratio
        compression_ratio = round((1 - summary_word_count / original_word_count) * 100, 1) if original_word_count > 0 else 0
        
        return TextSummarizeResponse(
            summary=summary,
            original_word_count=original_word_count,
            summary_word_count=summary_word_count,
            compression_ratio=compression_ratio
        )
        
    except Exception as e:
        # Handle Writer API errors or other exceptions
        if "api_key" in str(e).lower():
            raise HTTPException(
                status_code=401, 
                detail="Writer API key not configured. Please set WRITER_API_KEY environment variable."
            )
        elif "rate limit" in str(e).lower():
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please try again later."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Error generating summary: {str(e)}"
            )

# Streaming text summarization endpoint
@app.post("/api/summarize/stream")
async def summarize_text_stream(request: TextSummarizeRequest):
    """
    Summarize the provided text using Writer AI with streaming response
    Returns Server-Sent Events (SSE) with chunks of the summary
    """
    try:
        # Validate input
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        if len(request.text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Text must be at least 50 characters long")
        
        # Count original words
        original_word_count = count_words(request.text)
        
        # Create summarization prompt based on style
        if request.style == "bullet_points":
            prompt = f"""Please summarize the following text in bullet points format. Focus on the key points and main ideas:

{request.text}

Summary (bullet points):"""
        elif request.style == "detailed":
            prompt = f"""Please provide a detailed summary of the following text, maintaining important details and context:

{request.text}

Detailed summary:"""
        else:  # concise
            prompt = f"""Please provide a concise summary of the following text, capturing the main points in a clear and brief manner:

{request.text}

Concise summary:"""
        
        async def generate_stream() -> AsyncGenerator[str, None]:
            """Generator function that yields SSE formatted chunks"""
            summary_text = ""
            
            try:
                # Call Writer AI for summarization with streaming enabled
                stream = writer_client.chat.chat(
                    model="palmyra-x-004",
                    messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    max_tokens=request.max_length if request.max_length else 500,
                    temperature=0.3,
                    stream=True  # Enable streaming
                )
                
                # Stream the response chunks
                for chunk in stream:
                    if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        summary_text += content
                        
                        # Send chunk as SSE
                        yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
                
                # Calculate final statistics
                summary_word_count = count_words(summary_text)
                compression_ratio = round((1 - summary_word_count / original_word_count) * 100, 1) if original_word_count > 0 else 0
                
                # Send final statistics
                final_data = {
                    'type': 'complete',
                    'summary': summary_text,
                    'original_word_count': original_word_count,
                    'summary_word_count': summary_word_count,
                    'compression_ratio': compression_ratio
                }
                yield f"data: {json.dumps(final_data)}\n\n"
                
            except Exception as e:
                # Send error as SSE
                error_data = {
                    'type': 'error',
                    'message': str(e)
                }
                yield f"data: {json.dumps(error_data)}\n\n"
        
        return StreamingResponse(
            generate_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable proxy buffering
            }
        )
        
    except Exception as e:
        # Handle Writer API errors or other exceptions
        if "api_key" in str(e).lower():
            raise HTTPException(
                status_code=401, 
                detail="Writer API key not configured. Please set WRITER_API_KEY environment variable."
            )
        elif "rate limit" in str(e).lower():
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please try again later."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Error generating summary: {str(e)}"
            )

# Additional endpoint to get API info
@app.get("/api/info")
async def get_api_info():
    """Get information about the API"""
    return {
        "name": "Text Summarizer API",
        "version": "1.0.0",
        "description": "AI-powered text summarization using Writer SDK",
        "endpoints": {
            "/health": "Health check",
            "/api/summarize": "Summarize text (POST) - Returns complete response",
            "/api/summarize/stream": "Summarize text with streaming (POST) - Returns SSE stream",
            "/api/info": "API information"
        },
        "supported_styles": ["concise", "detailed", "bullet_points"]
    }

# Mount static files from UI dist folder (must be last to avoid conflicts with API routes)
app.mount("/", StaticFiles(directory="ui/dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)