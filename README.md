# Sum up corrency notes amount

> Point your camera at scatterd Indian currency notes. The app counts them for you.

This was a fun project! I first tried to train a vision model using EfficientNet but wasn't satisfied with the accuracy. Then I pivoted to using an API approach. You can use other vision APIs too, but **Gemini 2.5 Flash is free for limited use** and performs well on this task.

I got the idea from my parents — they sometimes ask me to count notes and I always get confused while counting. So I built something that does it for me.

---

## What it does

- Opens camera immediately on launch — point at any Indian currency notes
- Detects **all visible notes** in a single frame using Gemini's vision API
- Shows a running total that updates with each scan
- Keeps a **history of the last 10 scans** with timestamps, individual note breakdown, and per-scan totals
- All history is persisted locally with AsyncStorage — survives app restarts
- Supports denominations: ₹5, ₹10, ₹20, ₹50, ₹100, ₹200, ₹500 *(₹2000 excluded!)*

---



## Project Structure

```
CountNote/
├── app/
│   ├── index.jsx          
│   └── History.jsx        
├── assets/
│   └── images/
│       └── icon.jpg
├── app.json
├── package.json

```

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/CountNote.git
cd CountNote
```

### 2. Install dependencies

```bash
npm install
```

### 3. Add your Gemini API key

Get a key from [https://aistudio.google.com](https://aistudio.google.com)

Then update `app/index.jsx`:


### 4. Run the app

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app on your Android or iOS device.

---



## Limitations

- Requires internet connection (API call per scan)
- Very crumpled or heavily worn notes may not be detected correctly


---

