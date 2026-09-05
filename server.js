const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// HepsiJET Test Tanımları
const HEPSIJET_USERNAME = process.env.HEPSIJET_USERNAME || 'osmgrck_integration';
const HEPSIJET_PASSWORD = process.env.HEPSIJET_PASSWORD || 'T!SO22Pz9E';
const HEPSIJET_COMPANY_CODE = 'GORECEK';
const HEPSIJET_ADDRESS_ID = 'osma-gorecek-773';
const HEPSIJET_XDOCK_CODE = 'GORECEKMERKEZEFENDİ';

app.get('/', (req, res) => res.send('HepsiJET Entegrasyonu Aktif!'));

// 1. HepsiJET Token (Oturum Açma) Fonksiyonu
async function getHepsiJetToken() {
  try {
    const loginResponse = await axios.post(
      'https://integration-apitest.hepsijet.com/rest/login',
      {
        username: HEPSIJET_USERNAME,
        password: HEPSIJET_PASSWORD
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    // HepsiJET'in döndüğü token bilgisi
    const token = loginResponse.data?.data?.token || loginResponse.data?.token;
    if (token) {
      return token;
    }
    throw new Error('Token yanıtı boş: ' + JSON.stringify(loginResponse.data));
  } catch (error) {
    console.error('[HepsiJET Login Hatası]:', JSON.stringify(error.response?.data || error.message));
    throw error;
  }
}

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

    const fullAddress = `${shipping.address1 || ''}`.trim();
    const districtName = `${shipping.address2 || shipping.city || ''}`.trim(); 
    const cityName = `${shipping.province || shipping.city || ''}`.trim();     

    // 1. Oturum aç ve Token al
    console.log('[HepsiJET] Oturum açılıyor...');
    const token = await getHepsiJetToken();
    console.log('[HepsiJET] Oturum Başarılı! Token Alındı.');

    // 2. HepsiJET Tam İskelet Yapısı
    const hepsijetPayload = {
      company: {
        companyCode: HEPSIJET_COMPANY_CODE,
        companyAddressId: HEPSIJET_ADDRESS_ID
      },
      delivery: {
        customerDeliveryNo: `${order.order_number || Date.now()}`,
        deliveryType: 'STANDARD',
        productCategory: 'E-Ticaret',
        currentXdockAbbreviationCode: HEPSIJET_XDOCK_CODE
      },
      recipient: {
        name: `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
        phone1: shipping.phone || '05000000000',
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

    console.log('[HepsiJET Giden İskelet]:', JSON.stringify(hepsijetPayload));

    // 3. Siparişi HepsiJET'e Gönder
    const hepsijetResponse = await axios.post(
      'https://integration-apitest.hepsijet.com/rest/delivery/sendDeliveryOrder',
      hepsijetPayload,
      {
        headers: {
          'X-Auth-Token': token,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[HepsiJET Başarılı Yanıt]:', JSON.stringify(hepsijetResponse.data));
    
    // Kargo Takip Numarası / Barkod
    const trackingNumber = hepsijetResponse.data?.data?.barcode || hepsijetResponse.data?.barcode || hepsijetResponse.data?.data?.trackingNumber;
    
    if (trackingNumber && order.id) {
      console.log(`[Shopify] Takip Numarası İşleniyor: ${trackingNumber}`);
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
    console.log('[Shopify] Sipariş kargolandı olarak güncellendi ve takip numarası işlendi!');
  } catch (err) {
    console.error('[Shopify Fulfillment Hatası]:', err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif!`));
