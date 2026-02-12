/**
 * Audio Recorder with Timestamps and Transcription
 * Records audio, creates timestamp links, and provides live transcription
 */

class AudioRecorder {
    constructor() {
        this.isRecording = false;
        this.isPaused = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingStartTime = 0;
        this.timestamps = [];
        this.currentRecordingId = null;
        this.recognition = null;
        this.transcriptionEnabled = false;
        this.transcriptionText = '';

        // UI elements
        this.recordingUI = null;
        this.waveformCanvas = null;
        this.waveformCtx = null;
        this.audioContext = null;
        this.analyser = null;
    }

    async initialize() {
        this.createRecordingUI();
        await this.checkMicrophonePermission();
        this.initializeSpeechRecognition();
    }

    async checkMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            console.log('✅ Microphone permission granted');
            return true;
        } catch (err) {
            console.warn('⚠️ Microphone permission needed:', err);
            return false;
        }
    }

    createRecordingUI() {
        // Create fixed recording controls panel
        this.recordingUI = document.createElement('div');
        this.recordingUI.id = 'audioRecordingUI';
        this.recordingUI.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(44, 62, 80, 0.95);
            color: white;
            padding: 16px 20px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            display: none;
            z-index: 10000;
            min-width: 320px;
            backdrop-filter: blur(10px);
        `;

        this.recordingUI.innerHTML = `
            <div style="text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px;">
                    <div id="recordingIndicator" style="width: 12px; height: 12px; background: #e74c3c; border-radius: 50%; animation: pulse 1.5s infinite;"></div>
                    <span id="recordingTimer" style="font-family: 'Fira Code', monospace; font-size: 1.2rem; font-weight: bold;">00:00</span>
                </div>
                
                <canvas id="waveformCanvas" width="280" height="40" style="width: 100%; height: 40px; margin-bottom: 12px; border-radius: 8px; background: rgba(0,0,0,0.2);"></canvas>
                
                <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 12px;">
                    <button id="pauseRecordingBtn" style="padding: 8px 16px; border: none; background: #f39c12; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        ⏸️ Pause
                    </button>
                    <button id="addTimestampBtn" style="padding: 8px 16px; border: none; background: #3498db; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        📍 Mark
                    </button>
                    <button id="stopRecordingBtn" style="padding: 8px 16px; border: none; background: #e74c3c; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        ⏹️ Stop
                    </button>
                </div>
                
                <div id="transcriptionBox" style="display: none; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; max-height: 80px; overflow-y: auto; font-size: 0.85rem; text-align: left;">
                    <div style="font-weight: bold; margin-bottom: 5px; opacity: 0.8;">Live Transcription:</div>
                    <div id="transcriptionText" style="font-style: italic;"></div>
                </div>
                
                <div id="timestampList" style="max-height: 100px; overflow-y: auto; margin-top: 8px; display: none;"></div>
            </div>
        `;

        document.body.appendChild(this.recordingUI);

        // Add pulse animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.5; transform: scale(1.2); }
            }
            #audioRecordingUI button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            #audioRecordingUI button:active {
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);

        // Attach event listeners
        document.getElementById('pauseRecordingBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('addTimestampBtn').addEventListener('click', () => this.addTimestamp());
        document.getElementById('stopRecordingBtn').addEventListener('click', () => this.stopRecording());

        // Waveform canvas
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
    }

    initializeSpeechRecognition() {
        // Check for Web Speech API support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }

                this.transcriptionText += finalTranscript;
                const transcriptionTextEl = document.getElementById('transcriptionText');
                if (transcriptionTextEl) {
                    transcriptionTextEl.textContent = this.transcriptionText + interimTranscript;
                }
            };

            this.recognition.onerror = (event) => {
                console.warn('Speech recognition error:', event.error);
            };

            console.log('✅ Speech Recognition initialized');
        } else {
            console.warn('⚠️ Speech Recognition not supported in this browser');
        }
    }

    async startRecording(enableTranscription = false) {
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            // Create MediaRecorder with compression
            const mimeType = this.getSupportedMimeType();
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                audioBitsPerSecond: 32000 // 32kbps for voice (good quality, small size)
            });

            this.audioChunks = [];
            this.timestamps = [];
            this.transcriptionText = '';
            this.currentRecordingId = Date.now().toString();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                await this.saveRecording();
                stream.getTracks().forEach(track => track.stop());
            };

            // Setup audio visualization
            this.setupAudioVisualization(stream);

            // Start recording
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            this.transcriptionEnabled = enableTranscription;

            // Start transcription if enabled and available
            if (enableTranscription && this.recognition) {
                try {
                    this.recognition.start();
                    document.getElementById('transcriptionBox').style.display = 'block';
                } catch (err) {
                    console.warn('Could not start speech recognition:', err);
                }
            }

            // Show UI
            this.recordingUI.style.display = 'block';
            this.startTimer();
            this.drawWaveform();

            console.log(`🎙️ Recording started (${mimeType})`);
            return true;

        } catch (err) {
            console.error('Error starting recording:', err);
            alert('Cannot access microphone. Please grant permission and try again.');
            return false;
        }
    }

    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return ''; // Use default
    }

    setupAudioVisualization(stream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);
        this.analyser.fftSize = 256;
    }

    drawWaveform() {
        if (!this.isRecording || this.isPaused) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;

        this.waveformCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.waveformCtx.fillRect(0, 0, width, height);

        this.waveformCtx.lineWidth = 2;
        this.waveformCtx.strokeStyle = '#3498db';
        this.waveformCtx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * height) / 2;

            if (i === 0) {
                this.waveformCtx.moveTo(x, y);
            } else {
                this.waveformCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.waveformCtx.lineTo(width, height / 2);
        this.waveformCtx.stroke();

        requestAnimationFrame(() => this.drawWaveform());
    }

    startTimer() {
        const timerEl = document.getElementById('recordingTimer');

        const updateTimer = () => {
            if (!this.isRecording) return;

            if (!this.isPaused) {
                const elapsed = Date.now() - this.recordingStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }

            setTimeout(updateTimer, 1000);
        };

        updateTimer();
    }

    togglePause() {
        if (!this.mediaRecorder) return;

        if (this.isPaused) {
            this.mediaRecorder.resume();
            this.isPaused = false;
            document.getElementById('pauseRecordingBtn').innerHTML = '⏸️ Pause';
            if (this.recognition && this.transcriptionEnabled) {
                try {
                    this.recognition.start();
                } catch (e) { /* Already running */ }
            }
        } else {
            this.mediaRecorder.pause();
            this.isPaused = true;
            document.getElementById('pauseRecordingBtn').innerHTML = '▶️ Resume';
            if (this.recognition && this.transcriptionEnabled) {
                this.recognition.stop();
            }
        }
    }

    addTimestamp() {
        const elapsed = Date.now() - this.recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // Prompt for note
        const note = prompt('Add a note for this timestamp:', '');

        const timestamp = {
            time: elapsed,
            timeStr: timeStr,
            note: note || 'Marker',
            transcription: this.transcriptionText.slice(-100) // Last 100 chars
        };

        this.timestamps.push(timestamp);
        this.updateTimestampList();

        console.log(`📍 Timestamp added: ${timeStr} - ${timestamp.note}`);
    }

    updateTimestampList() {
        const listEl = document.getElementById('timestampList');

        if (this.timestamps.length === 0) {
            listEl.style.display = 'none';
            return;
        }

        listEl.style.display = 'block';
        listEl.innerHTML = '<div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 5px;">Timestamps:</div>';

        this.timestamps.forEach((ts, idx) => {
            const item = document.createElement('div');
            item.style.cssText = 'font-size: 0.75rem; padding: 4px; background: rgba(255,255,255,0.1); margin-bottom: 2px; border-radius: 4px;';
            item.textContent = `${idx + 1}. ${ts.timeStr} - ${ts.note}`;
            listEl.appendChild(item);
        });
    }

    async stopRecording() {
        if (!this.mediaRecorder || !this.isRecording) return;

        this.isRecording = false;
        this.isPaused = false;

        // Stop recognition
        if (this.recognition && this.transcriptionEnabled) {
            this.recognition.stop();
        }

        // Stop media recorder
        this.mediaRecorder.stop();

        // Stop audio context
        if (this.audioContext) {
            this.audioContext.close();
        }

        // Hide UI
        this.recordingUI.style.display = 'none';

        console.log('⏹️ Recording stopped');
    }

    async saveRecording() {
        if (this.audioChunks.length === 0) {
            console.warn('No audio data to save');
            return;
        }

        // Create blob
        const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Convert to base64 for IndexedDB storage
        const base64Audio = await this.blobToBase64(audioBlob);

        // Create recording object
        const recording = {
            id: this.currentRecordingId,
            timestamp: Date.now(),
            duration: Date.now() - this.recordingStartTime,
            mimeType: this.mediaRecorder.mimeType,
            audioData: base64Audio,
            timestamps: this.timestamps,
            transcription: this.transcriptionText,
            size: audioBlob.size
        };

        // Save to IndexedDB
        await this.saveToIndexedDB(recording);

        // Show playback UI
        this.showPlaybackUI(recording, audioUrl);

        console.log(`💾 Recording saved (${(audioBlob.size / 1024).toFixed(1)} KB)`);
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async saveToIndexedDB(recording) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NotebookAudioDB', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('recordings')) {
                    db.createObjectStore('recordings', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['recordings'], 'readwrite');
                const store = transaction.objectStore('recordings');
                store.add(recording);

                transaction.oncomplete = () => {
                    console.log('✅ Recording saved to IndexedDB');
                    resolve();
                };

                transaction.onerror = () => reject(transaction.error);
            };

            request.onerror = () => reject(request.error);
        });
    }

    showPlaybackUI(recording, audioUrl) {
        const playbackDiv = document.createElement('div');
        playbackDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            max-width: 300px;
            z-index: 9999;
        `;

        playbackDiv.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold; color: #2c3e50;">
                🎵 Recording Saved
            </div>
            <audio controls style="width: 100%; margin-bottom: 10px;">
                <source src="${audioUrl}" type="${recording.mimeType}">
            </audio>
            <div style="font-size: 0.8rem; color: #7f8c8d;">
                Duration: ${Math.floor(recording.duration / 1000)}s | 
                Size: ${(recording.size / 1024).toFixed(1)} KB
            </div>
            ${recording.timestamps.length > 0 ? `
                <div style="margin-top: 10px; font-size: 0.75rem;">
                    <strong>Timestamps:</strong>
                    ${recording.timestamps.map((ts, idx) => `
                        <div style="padding: 4px; background: #ecf0f1; margin: 4px 0; border-radius: 4px;">
                            ${idx + 1}. ${ts.timeStr} - ${ts.note}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 8px; width: 100%; border: none; background: #e74c3c; color: white; border-radius: 6px; cursor: pointer;">
                Close
            </button>
        `;

        document.body.appendChild(playbackDiv);

        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (playbackDiv.parentElement) {
                playbackDiv.remove();
            }
        }, 30000);
    }

    async getAllRecordings() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NotebookAudioDB', 1);

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['recordings'], 'readonly');
                const store = transaction.objectStore('recordings');
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = () => resolve(getAllRequest.result);
                getAllRequest.onerror = () => reject(getAllRequest.error);
            };

            request.onerror = () => reject(request.error);
        });
    }

    destroy() {
        if (this.isRecording) {
            this.stopRecording();
        }
        if (this.recordingUI) {
            this.recordingUI.remove();
        }
        if (this.recognition) {
            this.recognition.stop();
        }
    }
}

// Export for global use
window.AudioRecorder = AudioRecorder;
