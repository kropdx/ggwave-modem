"use client";

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

export default function Home() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [isCaptureActive, setIsCaptureActive] = useState(false);
  const [receivedCodes, setReceivedCodes] = useState([]);
  const [lastCodeReceived, setLastCodeReceived] = useState('');
  const [ggwaveInstance, setGgwaveInstance] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [audioContext, setAudioContext] = useState(null);
  const [recorder, setRecorder] = useState(null);
  const [signalStrength, setSignalStrength] = useState(0);
  const canvasRef = useRef(null);
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
  }, [audioContext, mediaStream, recorder]);

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
      let context;
      if (!audioContext) {
        context = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 48000
        });
        setAudioContext(context);
      } else {
        context = audioContext;
      }
      
      // Resume the audio context if it's suspended
      if (context.state === 'suspended') {
        await context.resume();
      }

      // Update ggwave parameters with actual audio context sample rate
      const { ggwave, instance } = ggwaveInstance;
      const parameters = ggwave.getDefaultParameters();
      parameters.sampleRateInp = context.sampleRate;
      parameters.sampleRateOut = context.sampleRate;
      
      // Get microphone access
      let stream;
      try {
        console.log('Requesting microphone access...');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
            channelCount: 1,
            sampleRate: 48000
          },
          video: false
        });
        console.log('Microphone access granted, stream active:', stream.active);
        console.log('Audio tracks:', stream.getAudioTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          label: t.label,
          muted: t.muted,
          readyState: t.readyState
        })));
        setMediaStream(stream);
      } catch (err) {
        console.error('Error accessing microphone:', err);
        setStatus('error');
        setIsCaptureActive(false);
        return;
      }

      // Create media stream source
      const mediaStreamSource = context.createMediaStreamSource(stream);
      console.log('Created media stream source');
      
      // Create analyzer node for visualizing the audio signal
      const analyzerNode = context.createAnalyser();
      analyzerNode.fftSize = 1024;
      analyzerNode.smoothingTimeConstant = 0.8; // Add some smoothing
      console.log('Created analyzer node with fftSize:', analyzerNode.fftSize);
      
      // Connect the nodes
      mediaStreamSource.connect(analyzerNode);
      console.log('Connected mediaStreamSource to analyzerNode');
      
      // Setup visualization data
      const bufferLength = analyzerNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const freqData = new Uint8Array(bufferLength);
      
      // Debug log for audio context and analyzer setup
      console.log('Audio context sample rate:', context.sampleRate);
      console.log('Analyzer FFT size:', analyzerNode.fftSize);
      console.log('Frequency bin count:', analyzerNode.frequencyBinCount);
      
      // Function to update visualization
      const updateVisualization = () => {
        if (!isCaptureActive) return;
        
        // Get time domain data
        analyzerNode.getByteTimeDomainData(dataArray);
        
        // Get frequency data to calculate signal strength
        analyzerNode.getByteFrequencyData(freqData);
        
        // Log first few frequency values for debugging
        if (Date.now() % 1000 < 16) { // Log once per second
          console.log('Frequency data (first 10 values):', Array.from(freqData).slice(0, 10));
        }
        
        // Calculate signal strength (more responsive version)
        let sum = 0;
        let max = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
          if (freqData[i] > max) max = freqData[i];
        }
        
        // More responsive signal strength calculation
        const avgStrength = sum / freqData.length;
        const normalizedStrength = Math.min(1, max / 200); // Scale max to 0-1 range
        
        // Log signal strength periodically
        if (Date.now() % 1000 < 16) { // Log once per second
          console.log('Signal strength - Raw:', max, 'Normalized:', normalizedStrength, 'Average:', avgStrength);
        }
        
        // Update state with some smoothing
        setSignalStrength(prev => {
          // Apply some smoothing to the signal strength
          const newStrength = prev * 0.7 + normalizedStrength * 0.3;
          return newStrength;
        });
        
        // Continue the animation frame loop
        requestAnimationFrame(updateVisualization);
      };
      
      // Start the visualization loop
      const animationId = requestAnimationFrame(updateVisualization);
      
      // Clean up function to be called when component unmounts
      const cleanup = () => {
        cancelAnimationFrame(animationId);
      };
      
      // Store cleanup function for later use
      window.modemCleanup = cleanup;

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

          // Add the received code to our list if it's not a duplicate of the most recent code
          if (decodedText !== lastCodeReceived) {
            setLastCodeReceived(decodedText);
            setReceivedCodes(prev => {
              // Add the new code with timestamp
              const newList = [
                { text: decodedText, time: new Date().toLocaleTimeString() },
                ...prev
              ];
              // Limit the list to the most recent 10 codes
              return newList.slice(0, 10);
            });
          }
          
          // Set status to success to show we're getting data, but don't stop capturing
          setStatus('receiving');
        }
      };

      // Connect nodes and start capturing
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
    setIsCaptureActive(false);
    
    if (recorder && audioContext) {
      try {
        recorder.disconnect();
        setRecorder(null);
      } catch (e) {
        console.error('Error disconnecting recorder:', e);
      }
    }

    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach(track => {
          track.stop();
          mediaStream.removeTrack(track);
        });
      } catch (e) {
        console.error('Error stopping media stream:', e);
      }
      setMediaStream(null);
    }

    setStatus('idle');
    
    // Reset signal strength when stopping
    setSignalStrength(0);
  };

  const resetListener = () => {
    stopCapturing();
    setStatus('idle');
    setReceivedCodes([]);
    setLastCodeReceived('');
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
            <h2 className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sound-based Modem Receiver
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This receiver will continuously listen for and display any sound codes it detects
            </p>
          </div>

          <div className="flex justify-center">
            {!isCaptureActive ? (
              <button
                onClick={startCapturing}
                disabled={!ggwaveInstance}
                className={`px-4 py-2 rounded-md text-white ${
                  !ggwaveInstance
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
                Press Start Listening to begin detecting codes
              </p>
            )}
            {status === 'listening' && (
              <div>
                <div className="animate-pulse flex items-center justify-center space-x-2 mb-2">
                  <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                  <p className="text-indigo-600 dark:text-indigo-400">
                    Listening for codes...
                  </p>
                </div>
                
                <div className="border border-indigo-200 dark:border-indigo-800 rounded-md overflow-hidden mb-2 h-32 w-full bg-gray-900 p-2">
                  <div className="flex h-full items-center justify-center">
                    <div className="flex space-x-1 items-end h-full w-full">
                      {[...Array(30)].map((_, i) => {
                        // Create a more dynamic visualization based on signal strength
                        const height = Math.min(
                          100, 
                          (signalStrength * 150) * 
                          (0.7 + 0.6 * Math.sin(i * 0.5 + Date.now() * 0.01)) * 
                          (0.8 + Math.random() * 0.4)
                        );
                        
                        // Color based on signal strength
                        const colorClass = signalStrength > 0.6 ? 'bg-green-500' : 
                                          signalStrength > 0.3 ? 'bg-yellow-500' : 'bg-indigo-500';
                        
                        return (
                          <div 
                            key={i} 
                            className={`w-1.5 rounded-full transition-all duration-75 ${colorClass}`}
                            style={{
                              height: `${height}%`,
                              opacity: 0.7 + (signalStrength * 0.3)
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Signal strength indicator with text */}
                <div className="flex flex-col items-center mb-2">
                  <div className="w-full max-w-xs h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                    <div 
                      className={`h-full transition-all duration-200 ${
                        signalStrength > 0.6 ? 'bg-green-500' : 
                        signalStrength > 0.3 ? 'bg-yellow-500' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.floor(signalStrength * 110))}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Signal strength: {Math.floor(signalStrength * 100)}%
                  </p>
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                    {Math.floor(signalStrength * 100)}%
                  </span>
                </div>
              </div>
            )}
            {status === 'receiving' && receivedCodes.length > 0 && (
              <div>
                <div className="animate-pulse flex items-center justify-center space-x-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <p className="text-green-600 dark:text-green-400">
                    Actively receiving codes
                  </p>
                </div>
                
                <div className="border border-green-200 dark:border-green-800 rounded-md overflow-hidden mb-2 h-32 w-full bg-gray-900">
                  {/* Replacing canvas with simpler visualization */}
                  <div className="flex h-full items-center justify-center">
                    <div className="flex space-x-1">
                      {[...Array(10)].map((_, i) => (
                        <div 
                          key={i} 
                          className="w-2 bg-green-500 rounded-full animate-pulse" 
                          style={{
                            height: `${(signalStrength * 100) * (0.5 + Math.random() * 0.5)}%`,
                            animationDelay: `${i * 0.1}s`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Signal strength indicator */}
                <div className="flex items-center justify-center mb-4">
                  <div className="w-64 h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all duration-100"
                      style={{ width: `${Math.floor(signalStrength * 100)}%` }}
                    ></div>
                  </div>
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                    {Math.floor(signalStrength * 100)}%
                  </span>
                </div>
                
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md max-h-60 overflow-y-auto">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Received Codes:</h3>
                  <ul className="space-y-2">
                    {receivedCodes.map((item, index) => (
                      <li key={index} className="flex justify-between items-center p-2 bg-white dark:bg-gray-800 rounded shadow-sm">
                        <span className="font-mono text-gray-800 dark:text-gray-200">{item.text}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{item.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <button
                  onClick={resetListener}
                  className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-white text-sm"
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
