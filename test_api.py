#!/usr/bin/env python3
"""
Test script for the Text Summarizer API
Run this after starting the FastAPI server to test the endpoints
"""

import requests
import json

# API base URL
BASE_URL = "http://localhost:8000"

def test_health_check():
    """Test the health check endpoint"""
    print("Testing health check...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_api_info():
    """Test the API info endpoint"""
    print("\nTesting API info...")
    try:
        response = requests.get(f"{BASE_URL}/api/info")
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_summarization():
    """Test the text summarization endpoint"""
    print("\nTesting text summarization...")
    
    # Sample text to summarize
    sample_text = """
    Artificial Intelligence (AI) has become one of the most transformative technologies of the 21st century. 
    It encompasses a wide range of techniques and applications, from machine learning and deep learning to 
    natural language processing and computer vision. AI systems are now being used in various industries, 
    including healthcare, finance, transportation, and entertainment. In healthcare, AI helps with medical 
    diagnosis, drug discovery, and personalized treatment plans. In finance, it's used for fraud detection, 
    algorithmic trading, and risk assessment. The transportation industry leverages AI for autonomous vehicles 
    and traffic optimization. Meanwhile, the entertainment sector uses AI for content recommendation, game 
    development, and special effects. As AI continues to evolve, it promises to bring even more innovations 
    and improvements to our daily lives, though it also raises important questions about ethics, privacy, 
    and the future of work.
    """
    
    # Test data
    test_data = {
        "text": sample_text.strip(),
        "style": "concise",
        "max_length": 200
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/summarize",
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Original word count: {result['original_word_count']}")
            print(f"Summary word count: {result['summary_word_count']}")
            print(f"Compression ratio: {result['compression_ratio']}%")
            print(f"Summary: {result['summary']}")
        else:
            print(f"Error response: {response.json()}")
        
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    """Run all tests"""
    print("=== Text Summarizer API Tests ===\n")
    
    tests = [
        ("Health Check", test_health_check),
        ("API Info", test_api_info),
        ("Text Summarization", test_summarization)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*50}")
        result = test_func()
        results.append((test_name, result))
        print(f"{'='*50}")
    
    # Summary
    print(f"\n{'='*50}")
    print("TEST RESULTS SUMMARY:")
    print(f"{'='*50}")
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    all_passed = all(result for _, result in results)
    print(f"\nOverall: {'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")

if __name__ == "__main__":
    main() 