"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function Transmit() {
  const [code, setCode] = useState('');
  const [ggwaveInstance, setGgwaveInstance] = useState(null);
  const [audioContext, setAudioContext] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState('idle');
  const [volume, setVolume] = useState(50);
  const [protocol, setProtocol] = useState('GGWAVE_PROTOCOL_AUDIBLE_FAST');
  const [protocols, setProtocols] = useState([]);
  const [speakerMode, setSpeakerMode] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const canvasRef = useRef(null);
  const signalStrengthRef = useRef(0);

  // Load the ggwave library when component mounts
  useEffect(() => {
    let mounted = true;

    const loadGgwave = async () => {
      try {
        // Dynamically import ggwave
        const ggwaveModule = await import('ggwave');
        
        if (!mounted) return;
        
        const ggwave = await ggwaveModule.default();
        const parameters = ggwave.getDefaultParameters();
        
        // Get all available protocols for selection
        const protocolOptions = [];
        for (let key in ggwave.ProtocolId) {
          protocolOptions.push({
            id: key,
            name: key.replace('GGWAVE_PROTOCOL_', '').replace('_', ' ')
          });
        }
        setProtocols(protocolOptions);
        
        // Initialize with browser default sample rate (will be updated when audio context is created)
        parameters.sampleRateInp = 48000;
        parameters.sampleRateOut = 48000;
        
        const instance = ggwave.init(parameters);
        setGgwaveInstance({ ggwave, instance });
        console.log('ggwave loaded successfully for transmitter');
      } catch (error) {
        console.error('Failed to load ggwave:', error);
        setStatus('error');
      }
    };

    loadGgwave();

    return () => {
      mounted = false;
      // Clean up
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioContext]);

  // Helper function to convert between typed arrays
  const convertTypedArray = (src, type) => {
    const buffer = new ArrayBuffer(src.byteLength);
    new src.constructor(buffer).set(src);
    return new type(buffer);
  };

  const transmitCode = async () => {
    if (!ggwaveInstance || !code) {
      return;
    }

    setIsSending(true);
    setStatus('sending');

    try {
      // Create audio context if it doesn't exist
      const context = audioContext || new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000
      });
      
      if (!audioContext) {
        setAudioContext(context);
      }
      
      // Enable speaker phone mode if selected
      if (speakerMode && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        try {
          // Get audio output devices
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
          
          // Look for speaker or loudspeaker
          const speaker = audioOutputs.find(device => 
            device.label.toLowerCase().includes('speaker') || 
            device.label.toLowerCase().includes('loud'));
          
          if (speaker && typeof context.setSinkId === 'function') {
            await context.setSinkId(speaker.deviceId);
            console.log('Speaker phone mode enabled');
          } else {
            // Fallback for browsers that don't support setSinkId
            // This is a best-effort approach as not all browsers support this API
            if (typeof Audio !== 'undefined') {
              const audio = new Audio();
              if (typeof audio.setSinkId === 'function' && speaker) {
                await audio.setSinkId(speaker.deviceId);
                console.log('Speaker phone mode enabled via Audio API');
              }
            }
          }
        } catch (error) {
          console.warn('Failed to enable speaker phone mode:', error);
        }
      }

      // Get ggwave instance
      const { ggwave, instance } = ggwaveInstance;

      // Generate waveform for the code based on selected protocol
      const waveform = ggwave.encode(
        instance, 
        code, 
        ggwave.ProtocolId[protocol], 
        volume // Volume (0-100)
      );

      // Convert and play the audio
      const buf = convertTypedArray(waveform, Float32Array);
      const buffer = context.createBuffer(1, buf.length, context.sampleRate);
      buffer.getChannelData(0).set(buf);
      
      const source = context.createBufferSource();
      source.buffer = buffer;
      
      // Create analyzer to visualize sound wave
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 1024; // Increased for better resolution
      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const freqData = new Uint8Array(bufferLength);
      
      source.connect(analyzer);
      analyzer.connect(context.destination);
      source.start(0);
      setIsTransmitting(true);
      
      // Draw visualization if canvas is available
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        
        function draw() {
          if (status !== 'sending') return;
          
          requestAnimationFrame(draw);
          
          // Get both time and frequency domain data
          analyzer.getByteTimeDomainData(dataArray);
          analyzer.getByteFrequencyData(freqData);
          
          // Calculate signal strength (average of frequency data)
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) {
            sum += freqData[i];
          }
          const avgStrength = sum / freqData.length;
          signalStrengthRef.current = avgStrength / 255; // Normalize to 0-1
          
          // Clear canvas
          canvasCtx.fillStyle = 'rgb(34, 40, 49)';
          canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw waveform
          canvasCtx.lineWidth = 2;
          canvasCtx.strokeStyle = 'rgb(0, 255, 0)';
          canvasCtx.beginPath();
          
          const sliceWidth = canvas.width / bufferLength;
          let x = 0;
          
          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height/2;
            
            if (i === 0) {
              canvasCtx.moveTo(x, y);
            } else {
              canvasCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
          }
          
          canvasCtx.lineTo(canvas.width, canvas.height/2);
          canvasCtx.stroke();
          
          // Draw frequency spectrum at the bottom
          canvasCtx.fillStyle = 'rgb(0, 255, 255)';
          const barWidth = canvas.width / (bufferLength / 4);
          x = 0;
          
          // Only show lower frequencies (first quarter of data)
          for (let i = 0; i < bufferLength / 4; i++) {
            const barHeight = (freqData[i] / 255) * (canvas.height / 3);
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth;
          }
          
          // Draw signal strength indicator
          canvasCtx.fillStyle = `rgba(255, ${Math.floor(255 * signalStrengthRef.current)}, 0, 0.7)`;
          canvasCtx.fillRect(canvas.width - 30, 10, 20, 100);
          canvasCtx.fillStyle = 'rgb(255, 255, 255)';
          canvasCtx.fillRect(canvas.width - 30, 110 - (signalStrengthRef.current * 100), 20, 2);
          
          // Add text label
          canvasCtx.fillStyle = 'white';
          canvasCtx.font = '10px Arial';
          canvasCtx.fillText('Signal', canvas.width - 30, 125);
        }
        
        draw();
      }

      // Set timeout to update UI after transmission finishes
      source.onended = () => {
        setIsSending(false);
        setIsTransmitting(false);
        setStatus('sent');
        signalStrengthRef.current = 0;
        
        // Reset status after 5 seconds
        setTimeout(() => {
          if (status === 'sent') { // Only reset if still in 'sent' state
            setStatus('idle');
          }
        }, 5000);
      };
    } catch (error) {
      console.error('Error transmitting code:', error);
      setStatus('error');
      setIsSending(false);
    }
  };

  return (
    <div className="grid place-items-center min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 p-6">
      <main className="max-w-md w-full mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Modem Transmitter</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Send codes via sound
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="codeToSend" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Code to Send
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="codeToSend"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isSending}
                placeholder="Enter code to transmit..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="protocol" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Transmission Protocol
            </label>
            <div className="mt-1">
              <select
                id="protocol"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                disabled={isSending}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              >
                {protocols.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {protocol.includes('AUDIBLE') ? 'Audible: Human can hear the sound' : 'Ultrasonic: Sound is not audible to humans'}
              </p>
            </div>
          </div>
          
          <div>
            <label htmlFor="volume" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Volume: {volume}%
            </label>
            <div className="mt-1">
              <input
                type="range"
                id="volume"
                min="10"
                max="100"
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                disabled={isSending}
                className="w-full"
              />
            </div>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="speakerMode"
              checked={speakerMode}
              onChange={(e) => setSpeakerMode(e.target.checked)}
              disabled={isSending}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="speakerMode" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Enable Speaker Phone Mode (for mobile)
            </label>
          </div>

          <div className="flex justify-center">
            <button
              onClick={transmitCode}
              disabled={!code || !ggwaveInstance || isSending}
              className={`px-6 py-3 rounded-md text-white font-medium ${
                !code || !ggwaveInstance || isSending
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSending ? 'Transmitting...' : 'Transmit Code'}
            </button>
          </div>

          <div className="text-center">
            {status === 'idle' && (
              <p className="text-gray-500 dark:text-gray-400">
                Enter a code and press Transmit
              </p>
            )}
            {status === 'sending' && (
              <div>
                <p className="text-blue-600 dark:text-blue-400 mb-2">
                  Transmitting &ldquo;{code}&rdquo;...
                </p>
                <div className="border border-blue-200 dark:border-blue-800 rounded-md overflow-hidden">
                  <canvas ref={canvasRef} className="w-full h-48"></canvas>
                </div>
                {isTransmitting && (
                  <div className="mt-2 flex items-center justify-center">
                    <div className="relative w-64 h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-100"
                        style={{ width: `${Math.floor(signalStrengthRef.current * 100)}%` }}
                      ></div>
                    </div>
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                      {Math.floor(signalStrengthRef.current * 100)}%
                    </span>
                  </div>
                )}
              </div>
            )}
            {status === 'sent' && (
              <div className="bg-green-100 dark:bg-green-800 p-4 rounded-md">
                <p className="text-green-800 dark:text-green-200">
                  Code &ldquo;{code}&rdquo; transmitted successfully!
                </p>
              </div>
            )}
            {status === 'error' && (
              <p className="text-red-600 dark:text-red-400">
                Error transmitting code. Please try again.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Go to Receiver Page
          </Link>
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
