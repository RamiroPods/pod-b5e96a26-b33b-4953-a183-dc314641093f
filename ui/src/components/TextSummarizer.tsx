import { useState } from 'react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { FileText, Sparkles, Copy, Download, RotateCcw, AlertCircle } from 'lucide-react'
import { API_ENDPOINTS } from '../config/api'

interface Summary {
  id: string
  originalText: string
  summary: string
  timestamp: Date
  wordCount: {
    original: number
    summary: number
  }
  compressionRatio: number
  style: string
}

interface ApiResponse {
  summary: string
  original_word_count: number
  summary_word_count: number
  compression_ratio: number
}

interface ApiError {
  detail: string
}

export function TextSummarizer() {
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null)
  const [summaryStyle, setSummaryStyle] = useState<'concise' | 'detailed' | 'bullet_points'>('concise')
  const [error, setError] = useState<string | null>(null)
  const [useStreaming, setUseStreaming] = useState(true)
  const [streamingText, setStreamingText] = useState('')

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  const generateSummaryStreaming = async () => {
    if (!inputText.trim()) return

    setIsLoading(true)
    setError(null)
    setStreamingText('')

    try {
      const response = await fetch(`${API_ENDPOINTS.SUMMARIZE}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText,
          style: summaryStyle,
          max_length: 500
        }),
      })

      if (!response.ok) {
        const errorData: ApiError = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let accumulatedText = ''
      
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              
              if (data.type === 'chunk') {
                accumulatedText += data.content
                setStreamingText(accumulatedText)
              } else if (data.type === 'complete') {
                const newSummary: Summary = {
                  id: Date.now().toString(),
                  originalText: inputText,
                  summary: data.summary,
                  timestamp: new Date(),
                  wordCount: {
                    original: data.original_word_count,
                    summary: data.summary_word_count
                  },
                  compressionRatio: data.compression_ratio,
                  style: summaryStyle
                }

                setSummaries(prev => [newSummary, ...prev])
                setSelectedSummary(newSummary)
                setStreamingText('')
              } else if (data.type === 'error') {
                throw new Error(data.message)
              }
            } catch (parseError) {
              // Ignore parse errors for incomplete JSON chunks
              if (parseError instanceof SyntaxError && line.length > 6) {
                console.debug('Skipping incomplete JSON chunk')
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error generating summary:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
      setStreamingText('')
    } finally {
      setIsLoading(false)
    }
  }

  const generateSummary = async () => {
    if (!inputText.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(API_ENDPOINTS.SUMMARIZE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText,
          style: summaryStyle,
          max_length: 500
        }),
      })

      if (!response.ok) {
        const errorData: ApiError = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const data: ApiResponse = await response.json()

      const newSummary: Summary = {
        id: Date.now().toString(),
        originalText: inputText,
        summary: data.summary,
        timestamp: new Date(),
        wordCount: {
          original: data.original_word_count,
          summary: data.summary_word_count
        },
        compressionRatio: data.compression_ratio,
        style: summaryStyle
      }

      setSummaries(prev => [newSummary, ...prev])
      setSelectedSummary(newSummary)
    } catch (err) {
      console.error('Error generating summary:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  const downloadSummary = (summary: Summary) => {
    const content = `Original Text (${summary.wordCount.original} words):\n${summary.originalText}\n\nSummary (${summary.wordCount.summary} words, ${summary.style} style):\n${summary.summary}\n\nCompression: ${summary.compressionRatio}%\nGenerated on: ${summary.timestamp.toLocaleString()}`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `summary-${summary.style}-${summary.timestamp.toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearAll = () => {
    setInputText('')
    setSummaries([])
    setSelectedSummary(null)
    setError(null)
  }

  const retryLastSummary = () => {
    if (inputText.trim()) {
      generateSummary()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Text Summarizer</h1>
              <p className="text-gray-600">Transform long texts into concise summaries using Writer AI</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Input Text</h2>
                <div className="text-sm text-gray-500">
                  {countWords(inputText)} words
                </div>
              </div>

              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste or type your text here to generate a summary... (minimum 50 characters)"
                className="min-h-[300px] mb-4"
                disabled={isLoading}
              />

              {/* Summary Style Selector */}
              <div className="mb-4">
                <div className="block text-sm font-medium text-gray-700 mb-2">
                  Summary Style
                </div>
                <div className="flex space-x-2">
                  {[
                    { value: 'concise' as const, label: 'Concise' },
                    { value: 'detailed' as const, label: 'Detailed' },
                    { value: 'bullet_points' as const, label: 'Bullet Points' }
                  ].map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => setSummaryStyle(style.value)}
                      disabled={isLoading}
                      className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                        summaryStyle === style.value
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-red-800 font-medium">Error generating summary</p>
                      <p className="text-sm text-red-600 mt-1">{error}</p>
                      {error.includes('WRITER_API_KEY') && (
                        <p className="text-xs text-red-500 mt-2">
                          Make sure the backend server is running with a valid Writer API key.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={retryLastSummary}
                    className="mt-2 text-red-600 border-red-300 hover:bg-red-50"
                    disabled={isLoading || !inputText.trim()}
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* Streaming Toggle */}
              <div className="mb-4 flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useStreaming}
                    onChange={(e) => setUseStreaming(e.target.checked)}
                    disabled={isLoading}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable Streaming (real-time response)
                  </span>
                </label>
              </div>

              <div className="flex space-x-2">
                <Button
                  onClick={useStreaming ? generateSummaryStreaming : generateSummary}
                  disabled={!inputText.trim() || isLoading || inputText.trim().length < 50}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      {useStreaming ? 'Streaming...' : 'Summarizing...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Summary
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={clearAll}
                  disabled={isLoading}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>

              {inputText.trim().length > 0 && inputText.trim().length < 50 && (
                <p className="text-sm text-amber-600 mt-2">
                  Text must be at least 50 characters long ({inputText.trim().length}/50)
                </p>
              )}
            </div>
          </div>

          {/* Output Section */}
          <div className="space-y-4">
            {(selectedSummary || streamingText) ? (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {streamingText ? 'Streaming Summary...' : 'Summary'}
                    </h2>
                    {selectedSummary && (
                      <p className="text-sm text-gray-500 capitalize">{selectedSummary.style.replace('_', ' ')} style</p>
                    )}
                  </div>
                  {selectedSummary && !streamingText && (
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(selectedSummary.summary)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadSummary(selectedSummary)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {streamingText || selectedSummary?.summary}
                    {streamingText && (
                      <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse"></span>
                    )}
                  </p>
                </div>

                {selectedSummary && !streamingText && (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedSummary.wordCount.summary}
                      </div>
                      <div className="text-sm text-gray-600">Summary Words</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-600">
                        {selectedSummary.wordCount.original}
                      </div>
                      <div className="text-sm text-gray-600">Original Words</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedSummary.compressionRatio}%
                      </div>
                      <div className="text-sm text-gray-600">Compression</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Summary Yet</h3>
                  <p className="text-gray-500">
                    Enter some text (at least 50 characters) and click "Generate Summary" to get started
                  </p>
                  <div className="mt-4 text-sm text-gray-400">
                    <p>💡 Tip: Make sure the backend API is accessible</p>
                  </div>
                </div>
              </div>
            )}

            {/* History */}
            {summaries.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Summaries</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {summaries.map((summary) => (
                    <button
                      key={summary.id}
                      type="button"
                      onClick={() => setSelectedSummary(summary)}
                      className={`w-full p-3 rounded-lg border cursor-pointer transition-colors text-left ${
                        selectedSummary?.id === summary.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-sm text-gray-800 truncate">
                            {summary.originalText.substring(0, 60)}...
                          </p>
                          <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                            <span>{summary.wordCount.original} → {summary.wordCount.summary} words</span>
                            <span className="capitalize">{summary.style.replace('_', ' ')}</span>
                            <span>{summary.timestamp.toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 