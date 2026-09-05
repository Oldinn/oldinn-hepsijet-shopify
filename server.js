const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// Ortam Değişkenleri
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// HepsiJET Bilgileri
const HEPSIJET_USERNAME = process.env.HEPSIJET_USERNAME || 'osmgrck_integration';
const HEPSIJET_PASSWORD = process.env.HEPSIJET_PASSWORD || 'T!SO22Pz9E';
const HEPSIJET_COMPANY_CODE = 'GORECEK';
const HEPSIJET_ADDRESS_ID = 'osma-gorecek-773';
const HEPSIJET_XDOCK_CODE = 'GORECEKMERKEZEFENDİ';

const BASE_URL = 'https://integration-apitest.hepsijet.com';

let cachedToken = null;
let tokenExpiresAt = 0;

// 1. HepsiJET /auth/token Servisinden Token Alma
async function getHepsiJetToken() {
  const now = Date.now();
  
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  console.log('[HepsiJET] /auth/token adresinden yeni Token alınıyor...');

  const response = await axios.post(
    `${BASE_URL}/auth/token`,
    {
      username: HEPSIJET_USERNAME,
      password: HEPSIJET_PASSWORD
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Origin': 'integration',
        'X-Client-Id': 'hj-integration',
        'Accept': 'application/json'
      }
    }
  );

  if (response.data && response.data.status === 'OK' && response.data.data?.token) {
    cachedToken = response.data.data.token;
    tokenExpiresAt = now + 50 * 60 * 1000;
    console.log('[HepsiJET] Token başarıyla alındı!');
    return cachedToken;
  } else {
    throw new Error(`Token alınamadı: ${JSON.stringify(response.data)}`);
  }
}

app.get('/', (req, res) => res.send('HepsiJET Entegrasyonu Aktif!'));

// 2. Shopify Webhook Endpoint'i
app.post('/api/shopify-order-created', async (req, res) => {
  try {
    const order = req.body;
    console.log('>>> SHOPIFY WEBHOOK TETİKLENDİ <<<');
    console.log(`Sipariş No: #${order.order_number || 'Test'}`);

    const shipping = order.shipping_address;
    if (!shipping) {
      console.log('Teslimat adresi bulunamadı.');
      return res.status(200).send('No shipping address');
    }

    // Dinamik Token Al
    const token = await getHepsiJetToken();

    const fullAddress = `${shipping.address1 || ''} ${shipping.address2 || ''}`.trim();
    const cityName = `${shipping.province || shipping.city || ''}`.trim();
    const districtName = `${shipping.address2 || shipping.city || ''}`.trim();
    
    // Telefon numarasını temizle (10-11 hane)
    const cleanPhone = (shipping.phone || '05000000000').replace(/\D/g, '');

    const formattedOrderNo = `OLDINN${order.order_number || Date.now()}`;
    const todayDate = new Date().toISOString().split('T')[0];

    // HepsiJET Standart Temel Payload Structure
    const hepsijetPayload = {
      company: {
        companyCode: HEPSIJET_COMPANY_CODE,
        companyAddressId: HEPSIJET_ADDRESS_ID
      },
      delivery: {
        customerDeliveryNo: formattedOrderNo,
        customerOrderId: `${order.order_number || ''}`,
        deliveryType: 'STANDARD',
        productCategory: 'E-Ticaret',
        currentXdockAbbreviationCode: HEPSIJET_XDOCK_CODE,
        deliverySlotOriginal: '0',
        deliveryDateOriginal: todayDate
      },
      recipientPerson: {
        companyCustomerId: crypto.randomUUID(),
        firstname: `${shipping.first_name || 'Test'}`.trim(),
        lastname: `${shipping.last_name || 'Musteri'}`.trim(),
        phone1: cleanPhone,
        email: order.email || 'ornek@email.com'
      },
      recipientAddress: {
        companyAddressId: crypto.randomUUID(),
        country: 'Türkiye',
        cityName: cityName,
        townName: districtName,
        districtName: districtName,
        addressLine1: fullAddress
      },
      recipient: {
        name: `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
        phone1: cleanPhone,
        email: order.email || 'ornek@email.com',
        address: fullAddress,
        city: cityName,
        district: districtName
      },
      package: {
        desi: 1,
        weight: 1,
        productCount: order.line_items ? order.line_items.length : 1
      }
    };

    console.log('[HepsiJET Giden Veri]:', JSON.stringify(hepsijetPayload));

    // Sipariş Oluşturma İsteği (Barkodlu Gelişmiş Servis)
    const hepsijetResponse = await axios.post(
      `${BASE_URL}/rest/delivery/sendDeliveryOrderEnhanced`,
      hepsijetPayload,
      {
        headers: {
          'X-Auth-Token': token,
          'X-Origin': 'integration',
          'X-Client-Id': 'hj-integration',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log('[HepsiJET BAŞARILI YANIT]:', JSON.stringify(hepsijetResponse.data));
    
    const trackingNumber = hepsijetResponse.data?.data?.barcode || hepsijetResponse.data?.barcode || hepsijetResponse.data?.data?.trackingNumber;
    
    if (trackingNumber && order.id) {
      console.log(`[Shopify] Kargo takip kodu işleniyor: ${trackingNumber}`);
      await updateShopifyFulfillment(order.id, trackingNumber);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('[Hata Detayı]:', JSON.stringify(error.response?.data || error.message));
    res.status(200).send('Handled Error');
  }
});

async function updateShopifyFulfillment(orderId, trackingNumber) {
  try {
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
    console.log('[Shopify] Sipariş kargolandı olarak işaretlendi!');
  } catch (err) {
    console.error('[Shopify Hatası]:', err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif!`));
