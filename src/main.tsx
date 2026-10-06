import { installLatencyMeasurements } from './utils/latency';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

installLatencyMeasurements();

createRoot(document.getElementById('root')!).render(<App />);
