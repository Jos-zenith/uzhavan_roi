// instrumentation.ts
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({
    serviceName: 'uzhavan_roi' // Set your service name
  });
}
