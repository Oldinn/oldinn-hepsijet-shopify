const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const HEPSIJET_USERNAME = process.env.HEPSIJET_USERNAME || 'osmgrck_integration';
const HEPSIJET_PASSWORD = process.env.HEPSIJET_PASSWORD || 'T!SO22Pz9E';
const HEPSIJET_COMPANY_CODE = process.env.HEPSIJET_COMPANY_CODE || 'GORECEK';

app.get('/', (req, res) => res.send('HepsiJET Entegrasyonu Aktif!'));

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

    // HepsiJET Gönderi Yapısı
    const hepsijetPayload = {
      company: {
        companyCode: HEPSIJET_COMPANY_CODE
      },
      delivery: {
        customerDeliveryNo: `${order.order_number || Date.now()}`,
        deliveryType: 'STANDARD',
        productCategory: 'E-Ticaret'
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

    // 1. Deneme: X-Auth-Token olarak direkt kullanıcı adını gönderelim
    try {
      console.log('[HepsiJET] İntibak İsteği Atılıyor (Yöntem 1)...');
      const response = await axios.post(
        'https://integration-apitest.hepsijet.com/rest/delivery/sendDeliveryOrder',
        hepsijetPayload,
        {
          headers: {
            'X-Auth-Token': HEPSIJET_USERNAME,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('[HepsiJET Başarılı Yanıt (Yöntem 1)]:', JSON.stringify(response.data));
      return res.status(200).send('OK');
    } catch (err1) {
      console.log('[Yöntem 1 Hata]:', JSON.stringify(err1.response?.data || err1.message));
    }

    // 2. Deneme: Basic Auth (kullanıcı_adı:parola base64) formatı ile gönderim
    try {
      console.log('[HepsiJET] İntibak İsteği Atılıyor (Yöntem 2)...');
      const authHeader = Buffer.from(`${HEPSIJET_USERNAME}:${HEPSIJET_PASSWORD}`).toString('base64');
      const response2 = await axios.post(
        'https://integration-apitest.hepsijet.com/rest/delivery/sendDeliveryOrder',
        hepsijetPayload,
        {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'X-Auth-Token': HEPSIJET_USERNAME,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('[HepsiJET Başarılı Yanıt (Yöntem 2)]:', JSON.stringify(response2.data));
      return res.status(200).send('OK');
    } catch (err2) {
      console.log('[Yöntem 2 Hata]:', JSON.stringify(err2.response?.data || err2.message));
    }

    res.status(200).send('Handled Error');

  } catch (error) {
    console.error('[Genel Hata Detayı]:', error.message);
    res.status(200).send('Error');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif!`));
