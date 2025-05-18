"use client";

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

export default function Home() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [isCaptureActive, setIsCaptureActive] = useState(false);
  const [ggwaveInstance, setGgwaveInstance] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [audioContext, setAudioContext] = useState(null);
  const [recorder, setRecorder] = useState(null);
  const audioRef = useRef(null);

  // Load the ggwave library when component mounts
  useEffect(() => {
    let mounted = true;

    const loadGgwave = async () => {
      try {
        // Dynamically import ggwave (Next.js doesn't support static imports for WASM)
        const ggwaveModule = await import('ggwave');
        
        if (!mounted) return;
        
        const ggwave = await ggwaveModule.default();
        const parameters = ggwave.getDefaultParameters();
        
        // Initialize with browser default sample rate (will be updated when audio context is created)
        parameters.sampleRateInp = 48000;
        parameters.sampleRateOut = 48000;
        
        const instance = ggwave.init(parameters);
        setGgwaveInstance({ ggwave, instance });
        console.log('ggwave loaded successfully');
      } catch (error) {
        console.error('Failed to load ggwave:', error);
        setStatus('error');
      }
    };

    loadGgwave();

    return () => {
      mounted = false;
      // Clean up
      if (recorder) {
        recorder.disconnect();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  }, []);

  // Helper function to convert between typed arrays
  const convertTypedArray = (src, type) => {
    const buffer = new ArrayBuffer(src.byteLength);
    new src.constructor(buffer).set(src);
    return new type(buffer);
  };

  const startCapturing = async () => {
    if (!ggwaveInstance) {
      console.error('ggwave not loaded yet');
      return;
    }

    try {
      setStatus('listening');
      setIsCaptureActive(true);

      // Initialize audio context if not already done
      const context = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000
      });
      setAudioContext(context);

      // Update ggwave parameters with actual audio context sample rate
      const { ggwave, instance } = ggwaveInstance;
      const parameters = ggwave.getDefaultParameters();
      parameters.sampleRateInp = context.sampleRate;
      parameters.sampleRateOut = context.sampleRate;
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });
      setMediaStream(stream);

      // Create media stream source
      const mediaStreamSource = context.createMediaStreamSource(stream);

      // Create script processor for audio processing
      const bufferSize = 1024;
      const processorNode = context.createScriptProcessor
        ? context.createScriptProcessor(bufferSize, 1, 1)
        : context.createJavaScriptNode(bufferSize, 1, 1);

      processorNode.onaudioprocess = (e) => {
        const source = e.inputBuffer;
        
        // Convert audio data and decode using ggwave
        const res = ggwave.decode(
          instance, 
          convertTypedArray(new Float32Array(source.getChannelData(0)), Int8Array)
        );

        if (res && res.length > 0) {
          const decodedText = new TextDecoder("utf-8").decode(res);
          console.log('Decoded text:', decodedText);

          // Check if the decoded text matches the code we're listening for
          if (decodedText === code) {
            setStatus('success');
            // Stop capturing if code matched
            stopCapturing();
          }
        }
      };

      // Connect the audio nodes
      mediaStreamSource.connect(processorNode);
      processorNode.connect(context.destination);

      setRecorder(processorNode);

    } catch (error) {
      console.error('Error starting audio capture:', error);
      setStatus('error');
      setIsCaptureActive(false);
    }
  };

  const stopCapturing = () => {
    if (recorder && audioContext) {
      recorder.disconnect(audioContext.destination);
      setRecorder(null);
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }

    setIsCaptureActive(false);
    if (status !== 'success') {
      setStatus('idle');
    }
  };

  const resetListener = () => {
    stopCapturing();
    setStatus('idle');
  };

  return (
    <div className="grid place-items-center min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <main className="max-w-md w-full mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Modem</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Sound-based code verification
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Code to Listen For
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isCaptureActive}
                placeholder="Enter code to listen for..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-center">
            {!isCaptureActive ? (
              <button
                onClick={startCapturing}
                disabled={!code || !ggwaveInstance}
                className={`px-4 py-2 rounded-md text-white ${
                  !code || !ggwaveInstance
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                Start Listening
              </button>
            ) : (
              <button
                onClick={stopCapturing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-white"
              >
                Stop Listening
              </button>
            )}
          </div>

          <div className="text-center">
            {status === 'idle' && (
              <p className="text-gray-500 dark:text-gray-400">
                Enter a code and press Start Listening
              </p>
            )}
            {status === 'listening' && (
              <div className="animate-pulse flex items-center justify-center space-x-2">
                <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                <p className="text-indigo-600 dark:text-indigo-400">
                  Listening for "{code}"...
                </p>
              </div>
            )}
            {status === 'success' && (
              <div className="bg-green-100 dark:bg-green-800 p-4 rounded-md">
                <p className="text-green-800 dark:text-green-200 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Success! Code "{code}" detected
                </p>
                <button
                  onClick={resetListener}
                  className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md text-white text-sm"
                >
                  Reset
                </button>
              </div>
            )}
            {status === 'error' && (
              <p className="text-red-600 dark:text-red-400">
                Error initializing audio. Check microphone permissions.
              </p>
            )}
          </div>
        </div>

        <div className="text-sm text-center text-gray-500 dark:text-gray-400 mt-8">
          <p>
            Powered by{' '}
            <a 
              href="https://github.com/ggerganov/ggwave" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              ggwave
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
