import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { clearPlanCache } from '../services/planAccessService.js';
import seoCacheService from '../services/seoCacheService.js';
import socialMediaCacheService from '../services/socialMediaCacheService.js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Stripe webhook endpoint (raw body needed for signature verification)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    const stripe = (await import('stripe')).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

    event = stripeClient.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Stripe webhook received:', event.type);

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful checkout
async function handleCheckoutCompleted(session) {
  console.log('💳 Checkout completed:', session.id);

  const customerEmail = session.customer_email || session.customer_details?.email;
  const stripeCustomerId = session.customer;
  const subscriptionId = session.subscription;

  if (!customerEmail) {
    console.error('❌ No customer email in checkout session');
    return;
  }

  // Get subscription details to determine plan
  const stripe = (await import('stripe')).default;
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

  let plan = 'starter';
  if (subscriptionId) {
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
    plan = getPlanFromPriceId(subscription.items.data[0].price.id);
  }

  // Update user in Supabase
  const { data, error } = await supabase
    .from('users_table')
    .update({
      plan: plan,
      stripe_id: stripeCustomerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('email', customerEmail)
    .select();

  if (error) {
    console.error('❌ Error updating user subscription:', error);
  } else {
    console.log(`✅ User ${customerEmail} upgraded to ${plan}`);

    // Clear all caches so user immediately sees new features
    console.log(`🗑️ Clearing caches for ${customerEmail}...`);
    clearPlanCache(customerEmail);
    await seoCacheService.clearUserCache(customerEmail);
    await socialMediaCacheService.invalidateCache(customerEmail, 'facebook');
    await socialMediaCacheService.invalidateCache(customerEmail, 'instagram');
    await socialMediaCacheService.invalidateCache(customerEmail, 'linkedin');
    console.log('✅ All caches cleared - user will see new features on next refresh');
  }
}

// Handle subscription updates
async function handleSubscriptionUpdate(subscription) {
  console.log('🔄 Subscription updated:', subscription.id);

  const stripeCustomerId = subscription.customer;
  const plan = getPlanFromPriceId(subscription.items.data[0].price.id);
  const status = subscription.status;

  // Find user by stripe customer ID
  const { data: users, error: findError } = await supabase
    .from('users_table')
    .select('email')
    .eq('stripe_id', stripeCustomerId)
    .single();

  if (findError || !users) {
    console.error('❌ User not found for customer:', stripeCustomerId);
    return;
  }

  const customerEmail = users.email;

  // Update subscription
  const { error } = await supabase
    .from('users_table')
    .update({
      plan: plan,
      stripe_subscription_id: subscription.id,
      subscription_status: status,
      subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_id', stripeCustomerId);

  if (error) {
    console.error('❌ Error updating subscription:', error);
  } else {
    console.log(`✅ Subscription updated for ${customerEmail}: ${plan} (${status})`);

    // Clear all caches when plan changes
    console.log(`🗑️ Clearing caches for ${customerEmail}...`);
    clearPlanCache(customerEmail);
    await seoCacheService.clearUserCache(customerEmail);
    await socialMediaCacheService.invalidateCache(customerEmail, 'facebook');
    await socialMediaCacheService.invalidateCache(customerEmail, 'instagram');
    await socialMediaCacheService.invalidateCache(customerEmail, 'linkedin');
    console.log('✅ All caches cleared - user will see updated features');
  }
}

// Handle subscription cancellation
async function handleSubscriptionCancelled(subscription) {
  console.log('❌ Subscription cancelled:', subscription.id);

  const stripeCustomerId = subscription.customer;

  const { error } = await supabase
    .from('users_table')
    .update({
      plan: 'free',
      subscription_status: 'cancelled',
      stripe_subscription_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('stripe_id', stripeCustomerId);

  if (error) {
    console.error('❌ Error cancelling subscription:', error);
  } else {
    console.log('✅ Subscription cancelled, user downgraded to free');
  }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  console.log('💰 Payment succeeded:', invoice.id);

  const stripeCustomerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) return;

  // Update last payment date
  const { error } = await supabase
    .from('users_table')
    .update({
      last_payment_date: new Date().toISOString(),
      subscription_status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_id', stripeCustomerId);

  if (error) {
    console.error('❌ Error updating payment status:', error);
  } else {
    console.log('✅ Payment recorded');
  }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  console.log('⚠️ Payment failed:', invoice.id);

  const stripeCustomerId = invoice.customer;

  const { error } = await supabase
    .from('users_table')
    .update({
      subscription_status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_id', stripeCustomerId);

  if (error) {
    console.error('❌ Error updating payment failure:', error);
  } else {
    console.log('⚠️ User marked as past_due');
  }
}

// Map Stripe price IDs to plan names
function getPlanFromPriceId(priceId) {
  const priceToPlan = {
    [process.env.STRIPE_PRICE_STARTER]: 'starter',
    [process.env.STRIPE_PRICE_GROWTH]: 'growth',
    [process.env.STRIPE_PRICE_PRO]: 'pro',
  };

  return priceToPlan[priceId] || 'starter';
}

// Get user subscription status
router.get('/subscription-status', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const { data, error } = await supabase
      .from('users_table')
      .select('plan, subscription_status, stripe_id, subscription_current_period_end')
      .eq('email', email)
      .single();

    if (error) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      plan: data.plan || 'free',
      status: data.subscription_status || 'active',
      stripeCustomerId: data.stripe_id,
      currentPeriodEnd: data.subscription_current_period_end
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Create checkout session
router.post('/create-checkout-session', async (req, res) => {
  const { email, priceId, successUrl, cancelUrl } = req.body;

  if (!email || !priceId) {
    return res.status(400).json({ error: 'Email and priceId required' });
  }

  try {
    const stripe = (await import('stripe')).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

    // Check if user already has a Stripe customer ID
    const { data: user } = await supabase
      .from('users_table')
      .select('stripe_id')
      .eq('email', email)
      .single();

    let customerId = user?.stripe_id;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        email: email,
        metadata: { email }
      });
      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('users_table')
        .update({ stripe_id: customerId })
        .eq('email', email);
    }

    // Create checkout session
    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${process.env.FRONTEND_URL}/dashboard?upgrade=success`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/pricing`,
      metadata: {
        email: email
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create customer portal session
router.post('/create-portal-session', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const { data: user } = await supabase
      .from('users_table')
      .select('stripe_id')
      .eq('email', email)
      .single();

    if (!user?.stripe_id) {
      return res.status(404).json({ error: 'No Stripe customer found' });
    }

    const stripe = (await import('stripe')).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripeClient.billingPortal.sessions.create({
      customer: user.stripe_id,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

export default router;
