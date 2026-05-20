import { Component, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface GasStationUpdate {
  Id: string;
  Name: string;
  Address: string;
  Price: number;
  LastUpdated: string;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 500;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="container">
      <h2>Live Gas Prices</h2>

      <div class="controls">
        <label for="zip">Zip code</label>
        <input
          id="zip"
          type="text"
          inputmode="numeric"
          maxlength="5"
          [(ngModel)]="zipcode"
          [disabled]="isStreaming()"
          placeholder="30301"
        />
        @if (isStreaming()) {
          <button class="stop" (click)="stopStreaming()">Stop</button>
        } @else {
          <button (click)="startStreaming()" [disabled]="!isValidZip()">Fetch Live Prices</button>
        }
      </div>

      <p class="status" [class.error]="hasError()">Status: {{ statusMessage() }}</p>

      @if (cheapest(); as best) {
        <div class="cheapest">Cheapest so far: <strong>{{ best.Name }}</strong> at \${{ best.Price.toFixed(2) }}</div>
      }

      <div class="report-list">
        @for (station of sortedStations(); track station.Id) {
          <div class="station-card" [class.best]="station.Id === cheapest()?.Id">
            <div class="card-header">
              <h3>{{ station.Name }}</h3>
              <span class="price">\${{ station.Price.toFixed(2) }}</span>
            </div>
            <p class="address">{{ station.Address }}</p>
            <small class="time">Received at: {{ station.LastUpdated }}</small>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .container { padding: 20px; font-family: sans-serif; max-width: 600px; margin: auto; }
    .controls { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
    .controls label { font-weight: 600; }
    .controls input { padding: 8px 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; width: 100px; }
    .status { color: gray; font-style: italic; }
    .status.error { color: #c62828; }
    .cheapest { background: #e8f5e9; border-left: 4px solid #28a745; padding: 10px 12px; margin: 8px 0 16px; border-radius: 4px; }
    button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px; }
    button:disabled { background: #cccccc; cursor: not-allowed; }
    button.stop { background: #c62828; }
    .report-list { margin-top: 20px; }
    .station-card { border: 1px solid #ddd; border-radius: 6px; padding: 15px; margin-bottom: 12px; background-color: #f9f9f9; animation: fadeIn 0.4s ease-out forwards; }
    .station-card.best { border-color: #28a745; box-shadow: 0 0 0 1px #28a745 inset; }
    .card-header { display: flex; justify-content: space-between; align-items: center; }
    .price { font-size: 20px; font-weight: bold; color: #28a745; }
    .address { color: #555; margin: 5px 0; }
    .time { color: #888; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class App implements OnDestroy {
  zipcode = '30301';
  statusMessage = signal('Idle');
  isStreaming = signal(false);
  hasError = signal(false);
  gasStations = signal<GasStationUpdate[]>([]);

  sortedStations = computed(() => [...this.gasStations()].sort((a, b) => a.Price - b.Price));
  cheapest = computed(() => this.sortedStations()[0]);

  private eventSource?: EventSource;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopRequested = false;

  isValidZip(): boolean {
    return /^\d{5}$/.test(this.zipcode);
  }

  startStreaming() {
    if (!this.isValidZip()) {
      this.statusMessage.set('Please enter a 5-digit zip code.');
      this.hasError.set(true);
      return;
    }

    this.stopRequested = false;
    this.reconnectAttempts = 0;
    this.gasStations.set([]);
    this.hasError.set(false);
    this.isStreaming.set(true);
    this.connect();
  }

  stopStreaming() {
    this.stopRequested = true;
    this.closeEventSource();
    this.clearReconnectTimer();
    this.statusMessage.set('Stopped.');
    this.isStreaming.set(false);
  }

  private connect() {
    this.closeEventSource();
    this.statusMessage.set(
      this.reconnectAttempts === 0
        ? 'Listening to live data stream...'
        : `Reconnecting (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
    );

    const es = new EventSource(`/api/gas-prices/${this.zipcode}`);
    this.eventSource = es;

    es.onopen = () => {
      this.reconnectAttempts = 0;
      this.hasError.set(false);
      this.statusMessage.set('Listening to live data stream...');
    };

    es.onmessage = (event) => {
      try {
        const station: GasStationUpdate = JSON.parse(event.data);
        this.gasStations.update(stations => [...stations, station]);
      } catch {
        // Ignore malformed chunks; the next message will arrive shortly.
      }
    };

    es.onerror = () => {
      es.close();
      if (this.stopRequested) return;

      // EventSource fires onerror both on transient drops AND on the
      // server's natural EOF. Treat first failure as "stream complete";
      // only retry if we've received nothing yet.
      if (this.gasStations().length > 0) {
        this.statusMessage.set('Stream complete.');
        this.isStreaming.set(false);
        return;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.statusMessage.set('Could not reach the stream. Is the API running?');
      this.hasError.set(true);
      this.isStreaming.set(false);
      return;
    }
    this.reconnectAttempts++;
    const delay = BASE_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1);
    this.statusMessage.set(`Connection lost. Retrying in ${delay}ms...`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private closeEventSource() {
    this.eventSource?.close();
    this.eventSource = undefined;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  ngOnDestroy() {
    this.stopRequested = true;
    this.closeEventSource();
    this.clearReconnectTimer();
  }
}
