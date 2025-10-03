import express from 'express';
import { checkoutHandler, Webhooks } from '@dodopayments/express';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage (resets on redeploy - use KV for production)
const payments = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Dodo Payments API is running',
    timestamp: new Date().toISOString()
  });
});

// Static checkout route
app.get('/api/checkout', checkoutHandler({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
  returnUrl: process.env.DODO_PAYMENTS_RETURN_URL || 'https://pay.imaginea.store/payment-return',
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode',
  type: 'static'
}));

// Dynamic checkout route
app.post('/api/checkout', checkoutHandler({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
  returnUrl: process.env.DODO_PAYMENTS_RETURN_URL || 'https://pay.imaginea.store/payment-return',
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode',
  type: 'dynamic'
}));

// Webhook handler
app.post('/api/webhook', Webhooks({
  webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
  onPayload: async (payload) => {
    console.log('Received webhook payload:', payload);
  },
  onPaymentSucceeded: async (payload) => {
    console.log('Payment succeeded:', payload);
    const paymentId = payload.payment_id;
    payments.set(paymentId, {
      status: 'success',
      timestamp: new Date().toISOString(),
      data: payload
    });
  },
  onPaymentFailed: async (payload) => {
    console.log('Payment failed:', payload);
    const paymentId = payload.payment_id;
    payments.set(paymentId, {
      status: 'failed',
      timestamp: new Date().toISOString(),
      data: payload
    });
  },
  onPaymentProcessing: async (payload) => {
    console.log('Payment processing:', payload);
    const paymentId = payload.payment_id;
    payments.set(paymentId, {
      status: 'processing',
      timestamp: new Date().toISOString(),
      data: payload
    });
  },
  onPaymentCancelled: async (payload) => {
    console.log('Payment cancelled:', payload);
    const paymentId = payload.payment_id;
    payments.set(paymentId, {
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      data: payload
    });
  }
}));

// API endpoints
app.get('/api/payment-status/:paymentId', (req, res) => {
  const { paymentId } = req.params;
  const payment = payments.get(paymentId);
  
  if (payment) {
    res.json(payment);
  } else {
    res.status(404).json({ error: 'Payment not found' });
  }
});

app.get('/api/payments', (req, res) => {
  const allPayments = Array.from(payments.entries()).map(([id, data]) => ({
    id,
    ...data
  }));
  res.json(allPayments);
});

// Export for Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    // Set environment variables
    process.env.DODO_PAYMENTS_API_KEY = env.DODO_PAYMENTS_API_KEY;
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = env.DODO_PAYMENTS_WEBHOOK_KEY;
    process.env.DODO_PAYMENTS_RETURN_URL = env.DODO_PAYMENTS_RETURN_URL;
    process.env.DODO_PAYMENTS_ENVIRONMENT = env.DODO_PAYMENTS_ENVIRONMENT;

    return app.handle(request);
  }
};