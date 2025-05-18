# Sound Modem - Data Over Sound Application

This application demonstrates how to use [ggwave](https://github.com/ggerganov/ggwave), a data-over-sound library, with Next.js to create a web-based sound modem. It allows you to transmit and receive text codes between devices using sound waves.

## Features

- **Code Receiver**: Listen for specific sound-encoded text through your device's microphone
- **Code Transmitter**: Send text codes through sound from your device's speakers
- **Cross-platform**: Works on computers, tablets, and mobile phones
- **No network required**: Uses sound waves for data transmission, no internet connection needed between devices

## How It Works

This application uses the [ggwave library](https://github.com/ggerganov/ggwave) to handle the encoding and decoding of data into sound waves. The application has two main parts:

1. **Receiver**: Listens for sound patterns matching a specific code you enter
2. **Transmitter**: Converts a text code into sound for transmission

The communication happens via audio using a multi-frequency FSK (Frequency-Shift Keying) modulation scheme with Reed-Solomon error correction.

## Getting Started

### Prerequisites

- Node.js 16.8 or later
- A device with a microphone (for receiving) and/or speakers (for transmitting)
- Browser permissions for microphone access

### Installation

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

### To Receive Codes

1. Navigate to the Receiver page (home page)
2. Enter the specific code you want to listen for
3. Click "Start Listening"
4. The application will use your microphone to listen for that code
5. When it detects the code, it will show a success message

### To Transmit Codes

1. Navigate to the Transmitter page
2. Enter the code you want to transmit
3. Click "Transmit Code"
4. Your device will play the encoded sound

### Tips

- Keep devices close together for reliable transmission
- Reduce background noise for better reception
- For best results, use the same code on both the transmitter and receiver
- Some browsers may require HTTPS for microphone access

## Technology Used

- **Next.js**: React framework
- **ggwave**: JavaScript/WebAssembly bindings for data-over-sound
- **Web Audio API**: For audio capture and playback
- **Tailwind CSS**: For styling

## License

This project is licensed under the MIT License - see the original [ggwave repository](https://github.com/ggerganov/ggwave) for details.
