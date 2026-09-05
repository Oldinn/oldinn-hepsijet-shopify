const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const HEPSIJET_API_TOKEN = process.env.HEPSIJET_API_TOKEN;
const HEPSIJET_COMPANY_CODE = process.env.HEPSIJET_COMPANY_CODE;

app.get('/', (req, res) => res.send('HepsiJET Entegrasyonu Aktif!'));

app.post('/api/shopify-order-created', async (req, res) => {
  try {
    const order = req.body;
    const shipping = order.shipping_address;
    if (!shipping) return res.status(200).send('No shipping address');

    const hepsijetPayload = {
      company: { companyCode: HEPSIJET_COMPANY_CODE },
      delivery: { customerDeliveryNo: `${order.order_number}`, deliveryType: 'STANDARD', productCategory: 'E-Ticaret' },
      recipient: {
        name: `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
        phone1: shipping.phone || '05000000000',
        email: order.email || '',
        address: `${shipping.address1 || ''} ${shipping.address2 || ''}`.trim(),
        city: shipping.province || shipping.city,
        district: shipping.city
      },
      package: { desi: 1, weight: 1, productCount: order.line_items ? order.line_items.length : 1 }
    };

    const hepsijetResponse = await axios.post(
      'https://integration-apitest.hepsijet.com/rest/delivery/createDelivery',
      hepsijetPayload,
      { headers: { 'X-Auth-Token': HEPSIJET_API_TOKEN, 'Content-Type': 'application/json' } }
    );

    const trackingNumber = hepsijetResponse.data?.trackingNumber || hepsijetResponse.data?.data?.trackingNumber;
    if (trackingNumber) await updateShopifyFulfillment(order.id, trackingNumber);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Hata:', error.response?.data || error.message);
    res.status(500).send('Error');
  }
});

async function updateShopifyFulfillment(orderId, trackingNumber) {
  const fulfillmentOrderRes = await axios.get(
    `https://${SHOPIFY_SHOP}/admin/api/2026-01/orders/${orderId}/fulfillment_orders.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
  );
  const fulfillmentOrderId = fulfillmentOrderRes.data.fulfillment_orders[0].id;

  await axios.post(
    `https://${SHOPIFY_SHOP}/admin/api/2026-01/fulfillments.json`,
    {
      fulfillment: {
        line_items_by_fulfillment_order: [{ fulfillment_order_id: fulfillmentOrderId }],
        tracking_info: { number: trackingNumber, company: 'HepsiJET' }
      }
    },
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor`));
