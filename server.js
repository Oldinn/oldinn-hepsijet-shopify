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
    console.log('>>> SHOPIFY WEBHOOK TETİKLENDİ <<<');
    console.log(`Sipariş No: #${order.order_number || 'Test'}`);

    const shipping = order.shipping_address;
    if (!shipping) {
      console.log('Teslimat adresi bulunamadı.');
      return res.status(200).send('No shipping address');
    }

    // KURGULADIĞIN ADRES MANTIĞI:
    // Adres 1 = Mahalle / Cadde / Sokak / No
    // Adres 2 = İlçe
    // City = İl
    const fullAddress = `${shipping.address1 || ''}`.trim();
    const districtName = `${shipping.address2 || shipping.city || ''}`.trim(); 
    const cityName = `${shipping.province || shipping.city || ''}`.trim();     

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

    // Postman Dokümanındaki Doğru Endpoint Adresi:
    const hepsijetResponse = await axios.post(
      'https://integration-apitest.hepsijet.com/rest/delivery/sendDeliveryOrder',
      hepsijetPayload,
      {
        headers: {
          'X-Auth-Token': HEPSIJET_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[HepsiJET Başarılı Yanıt]:', JSON.stringify(hepsijetResponse.data));
    
    // HepsiJET'ten gelen kargo takip barkod numarası
    const trackingNumber = hepsijetResponse.data?.data?.barcode || hepsijetResponse.data?.barcode || hepsijetResponse.data?.data?.trackingNumber;
    
    if (trackingNumber && order.id) {
      console.log(`[Shopify] Takip Numarası İşleniyor: ${trackingNumber}`);
      await updateShopifyFulfillment(order.id, trackingNumber);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('[HepsiJET Hata Detayı]:', JSON.stringify(error.response?.data || error.message));
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
    console.log('[Shopify] Sipariş kargolandı olarak güncellendi.');
  } catch (err) {
    console.error('[Shopify Fulfillment Hatası]:', err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif!`));
