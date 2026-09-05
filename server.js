const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const HEPSIJET_API_TOKEN = process.env.HEPSIJET_API_TOKEN;
const HEPSIJET_COMPANY_CODE = process.env.HEPSIJET_COMPANY_CODE;

// Ana Sayfa Testi
app.get('/', (req, res) => res.send('HepsiJET Entegrasyonu Aktif!'));

// Shopify Webhook Endpoint'i
app.post('/api/shopify-order-created', async (req, res) => {
  try {
    const order = req.body;
    console.log('>>> SHOPIFY WEBHOOK TETİKLENDİ <<<');
    console.log(`Sipariş No: #${order.order_number || 'Test'}`);

    const shipping = order.shipping_address;
    if (!shipping) {
      console.log('Adres verisi bulunamadı.');
      return res.status(200).send('No shipping address');
    }

    const fullAddress = `${shipping.address1 || ''}`.trim();
    const districtName = `${shipping.address2 || shipping.city || ''}`.trim(); 
    const cityName = `${shipping.province || shipping.city || ''}`.trim();     

    const hepsijetPayload = {
      company: { companyCode: HEPSIJET_COMPANY_CODE },
      delivery: {
        customerDeliveryNo: `${order.order_number || Date.now()}`,
        deliveryType: 'STANDARD',
        productCategory: 'E-Ticaret'
      },
      recipient: {
        name: `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
        phone1: shipping.phone || '05000000000',
        email: order.email || '',
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

    const hepsijetResponse = await axios.post(
      'https://integration-apitest.hepsijet.com/rest/delivery/createDelivery',
      hepsijetPayload,
      {
        headers: {
          'X-Auth-Token': HEPSIJET_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[HepsiJET Yanıtı]:', hepsijetResponse.data);
    res.status(200).send('OK');

  } catch (error) {
    console.error('[Hata Detayı]:', error.response?.data || error.message);
    res.status(200).send('Error logged'); // Shopify re-try döngüsüne girmesin diye 200 dönüyoruz
  }
});

// Yanlış URL isteklerini yakalama
app.use((req, res) => {
  console.log(`[Bilinmeyen İstek Geldi] YOL: ${req.url} | METOT: ${req.method}`);
  res.status(404).send(`Girilen path yanlış: ${req.url}`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif!`));
