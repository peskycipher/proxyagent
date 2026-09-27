
# Custom Payment Flow

Build a fully customized cryptocurrency payment experience with complete control over the user interface and payment flow. This guide will walk you through creating a payment from scratch using CryptAPI's API.

![Example of CryptAPI's Custom Payment Flow taken from WooCommerce Plugin](/assets/images/custom-flow-integration.png)

*Example of CryptAPI's Custom Payment Flow taken from WooCommerce Plugin*


## Overview

The custom payment flow gives you maximum flexibility to create the exact payment experience you want. You'll handle:

- **Payment creation** - Generate payment addresses and amounts
- **User interface** - Build your own payment screens
- **Webhook handling** - Process the webhooks with the payment confirmations

> **INFO**
>**Estimated time:** 30-45 minutes for a basic implementation


## Setup

CryptAPI is designed to be simple and accessible. **You don't need to create an account or go through any complex setup process.** You just need to provide a wallet address where you want to receive the funds.

### 1. Get Your Wallet Address

Simply provide any cryptocurrency wallet address where you want to receive payments. This can be:

- **Bitcoin address** (starts with `1`, `3`, or `bc1`)
- **Ethereum address** (starts with `0x`)
- **USDT address** (TRC20, ERC20, or BEP20)
- **Any other supported cryptocurrency address**

> **INFO**
>**No account required:** You can use any wallet address you own. CryptAPI will automatically forward payments to your address without requiring you to create an account or provide any additional information.


### 2. Using CryptAPI

CryptAPI works by simply providing your wallet address in API calls:

1. **Provide your wallet address directly** in API calls using the `address` parameter
2. **Receive webhooks** to track payments
3. **No API keys or accounts required** - just your wallet address

> **INFO**
>**Simple and Direct:** CryptAPI automatically forwards payments to your address without requiring any account setup, API keys, or complex configuration.


> **WARNING**
>**Minimum Transaction Amounts:** Every cryptocurrency has minimum transaction amounts on different blockchains. Transactions below these minimums will be **ignored by CryptAPI systems and funds will be lost**. Always check the minimum amounts for your chosen cryptocurrencies before accepting payments. You can find the complete list at [cryptapi.io/cryptocurrencies](https://cryptapi.io/cryptocurrencies) or fetch them using the [info endpoint](/api/tickerinfo).


## Step 1: Create Payment

First, create a new payment by calling the CryptAPI API. You'll need your API key and the payment details.

```javascript
// Create a new payment
const createPayment = async (orderId) => {
  // Generate an unguessable nonce, store it with the order, then add it to the callback URL
  const nonce = crypto.randomUUID();
  storeNonce(orderId, nonce);
  const callbackUrl = encodeURIComponent(`https://yoursite.com/webhook?order_id=${orderId}&nonce=${nonce}`);
  
  const params = new URLSearchParams({
    callback: callbackUrl,
    address: 'YOUR_WALLET_ADDRESS',
    post: 0,
    json: 0,
    pending: 1,
    multi_token: 0,
    convert: 1
  });
  
  const response = await fetch(`https://api.cryptapi.io/btc/create/?${params}`);
  const data = await response.json();
  return data;
};
```

```php
<?php
function createPayment($orderId) {
    // Generate an unguessable nonce, store it with the order, then add it to the callback URL
    $nonce = bin2hex(random_bytes(16));
    storeNonce($orderId, $nonce);
    $callbackUrl = urlencode('https://yoursite.com/webhook?order_id=' . $orderId . '&nonce=' . $nonce);
    
    $params = http_build_query([
        'callback' => $callbackUrl,
        'address' => 'YOUR_WALLET_ADDRESS',
        'post' => 0,
        'json' => 0,
        'pending' => 1,
        'multi_token' => 0,
        'convert' => 1
    ]);
    
    $url = 'https://api.cryptapi.io/btc/create/?' . $params;
    $result = file_get_contents($url);
    
    return json_decode($result, true);
}
?>
```

```python
import requests
import secrets
from urllib.parse import quote

def create_payment(order_id):
    # Generate an unguessable nonce, store it with the order, then add it to the callback URL
    nonce = secrets.token_hex(16)
    store_nonce(order_id, nonce)
    callback_url = quote(f'https://yoursite.com/webhook?order_id={order_id}&nonce={nonce}')
    
    params = {
        'callback': callback_url,
        'address': 'YOUR_WALLET_ADDRESS',
        'post': 0,
        'json': 0,
        'pending': 1,
        'multi_token': 0,
        'convert': 1
    }
    
    response = requests.get('https://api.cryptapi.io/btc/create/', params=params)
    return response.json()
```

```ruby
require 'net/http'
require 'json'
require 'uri'
require 'securerandom'

def create_payment(order_id)
  # Generate an unguessable nonce, store it with the order, then add it to the callback URL
  nonce = SecureRandom.hex(16)
  store_nonce(order_id, nonce)
  callback_url = URI.encode_www_form_component("https://yoursite.com/webhook?order_id=#{order_id}&nonce=#{nonce}")
  
  params = {
    callback: callback_url,
    address: 'YOUR_WALLET_ADDRESS',
    post: 0,
    json: 0,
    pending: 1,
    multi_token: 0,
    convert: 1
  }
  
  query_string = URI.encode_www_form(params)
  uri = URI("https://api.cryptapi.io/btc/create/?#{query_string}")
  
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  
  request = Net::HTTP::Get.new(uri)
  response = http.request(request)
  JSON.parse(response.body)
end
```

```csharp
using System;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web;
using Newtonsoft.Json;

public class PaymentService
{
    private static readonly HttpClient client = new HttpClient();
    
    public async Task<dynamic> CreatePayment(string orderId)
    {
        // Generate an unguessable nonce, store it with the order, then add it to the callback URL
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        StoreNonce(orderId, nonce);
        var callbackUrl = HttpUtility.UrlEncode($"https://yoursite.com/webhook?order_id={orderId}&nonce={nonce}");
        
        var queryParams = HttpUtility.ParseQueryString(string.Empty);
        queryParams["callback"] = callbackUrl;
        queryParams["address"] = "YOUR_WALLET_ADDRESS";
        queryParams["post"] = "0";
        queryParams["json"] = "0";
        queryParams["pending"] = "1";
        queryParams["multi_token"] = "0";
        queryParams["convert"] = "1";
        
        var url = $"https://api.cryptapi.io/btc/create/?{queryParams}";
        var response = await client.GetAsync(url);
        var result = await response.Content.ReadAsStringAsync();
        
        return JsonConvert.DeserializeObject(result);
    }
}
```

```java
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import com.google.gson.Gson;
import java.util.Map;

public class PaymentService {
    private static final HttpClient client = HttpClient.newHttpClient();
    private static final Gson gson = new Gson();
    
    public Map<String, Object> createPayment(String orderId) {
        try {
            // Generate an unguessable nonce, store it with the order, then add it to the callback URL
            String nonce = java.util.UUID.randomUUID().toString();
            storeNonce(orderId, nonce);
            String callbackUrl = URLEncoder.encode(
                "https://yoursite.com/webhook?order_id=" + orderId + "&nonce=" + nonce, 
                StandardCharsets.UTF_8
            );
            
            String url = "https://api.cryptapi.io/btc/create/" +
                "?callback=" + callbackUrl +
                "&address=YOUR_WALLET_ADDRESS" +
                "&post=0" +
                "&json=0" +
                "&pending=1" +
                "&multi_token=0" +
                "&convert=1";
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .GET()
                .build();
            
            HttpResponse<String> response = client.send(request, 
                HttpResponse.BodyHandlers.ofString());
            return gson.fromJson(response.body(), Map.class);
        } catch (Exception e) {
            throw new RuntimeException("Payment creation failed", e);
        }
    }
}
```

```go
package main

import (
    "crypto/rand"
    "encoding/hex"
    "encoding/json"
    "net/http"
    "net/url"
    "io/ioutil"
    "fmt"
)

func createPayment(orderID string) (map[string]interface{}, error) {
    // Generate an unguessable nonce, store it with the order, then add it to the callback URL
    nonceBytes := make([]byte, 16)
    rand.Read(nonceBytes)
    nonce := hex.EncodeToString(nonceBytes)
    storeNonce(orderID, nonce)
    callbackURL := url.QueryEscape(fmt.Sprintf("https://yoursite.com/webhook?order_id=%s&nonce=%s", orderID, nonce))
    
    params := url.Values{}
    params.Add("callback", callbackURL)
    params.Add("address", "YOUR_WALLET_ADDRESS")
    params.Add("post", "0")
    params.Add("json", "0")
    params.Add("pending", "1")
    params.Add("multi_token", "0")
    params.Add("convert", "1")
    
    apiURL := fmt.Sprintf("https://api.cryptapi.io/btc/create/?%s", params.Encode())
    
    resp, err := http.Get(apiURL)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }
    
    var result map[string]interface{}
    json.Unmarshal(body, &result)
    
    return result, nil
}
```

```bash
# Generate an unguessable nonce and store it with the order, then URL encode the callback parameter
NONCE=$(openssl rand -hex 16)
CALLBACK_URL=$(echo "https://yoursite.com/webhook?order_id=12345&nonce=${NONCE}" | jq -rR @uri)

curl -G "https://api.cryptapi.io/btc/create/" \
  --data-urlencode "callback=${CALLBACK_URL}" \
  --data-urlencode "address=YOUR_WALLET_ADDRESS" \
  --data-urlencode "post=0" \
  --data-urlencode "json=0" \
  --data-urlencode "pending=1" \
  --data-urlencode "multi_token=0" \
  --data-urlencode "convert=1"
```

> **INFO: Using Our Official Libraries**
>For a simpler integration, you can also use our official libraries. Here's how you would create a custom payment:
> 
> ```javascript
> // Using the official Node.js library
> const CryptAPI = require('@cryptapi/api');
> 
> const callbackUrl = 'https://yoursite.com/webhook';
> // Generate an unguessable nonce, store it, and pass it as a param so the library adds it to the callback URL
> const nonce = crypto.randomUUID();
> storeNonce(orderId, nonce);
> const params = {
>   order_id: orderId,
>   nonce: nonce,
> };
> const cryptapiParams = {
>   post: 0,
>   json: 0,
>   pending: 1,
>   multi_token: 0,
>   convert: 1
> };
> 
> const bb = new CryptAPI('btc', 'YOUR_WALLET_ADDRESS', callbackUrl, params, cryptapiParams);
> const address = await bb.getAddress();
> // address.address_in
> ```
> 
> ```php
> // Using the official PHP library
> // Generate an unguessable nonce, store it, and pass it as a param so the library adds it to the callback URL
> $nonce = bin2hex(random_bytes(16));
> storeNonce($orderId, $nonce);
> $params = ['order_id' => $orderId, 'nonce' => $nonce];
> $cryptapiParams = [
>     'post' => 0,
>     'json' => 0,
>     'pending' => 1,
>     'multi_token' => 0,
>     'convert' => 1
> ];
> 
> $bb = new CryptAPI\CryptAPI('btc', 'YOUR_WALLET_ADDRESS', 'https://yoursite.com/webhook', $params, $cryptapiParams);
> $address = $bb->get_address();
> // $address->address_in
> ```
> 
> ```python
> # Using the official Python library
> from cryptapi import CryptAPIHelper
> import secrets
> 
> # Generate an unguessable nonce, store it, and pass it as a param so the library adds it to the callback URL
> nonce = secrets.token_hex(16)
> store_nonce(orderId, nonce)
> params = {'order_id': orderId, 'nonce': nonce}
> bb_params = {
>     'post': 0,
>     'json': 0,
>     'pending': 1,
>     'multi_token': 0,
>     'convert': 1
> }
> 
> bb = CryptAPIHelper('btc', 'YOUR_WALLET_ADDRESS', 'https://yoursite.com/webhook', params, bb_params)
> address = bb.get_address()
> # address['address_in']
> ```
> 
> You can find the full documentation for our libraries here:
> - [Node.js Library](/libraries/nodejs)
> - [PHP Library](/libraries/php)
> - [Python Library](/libraries/python)


Check the API Reference to understand all the parameters you can use with this endpoint.

- [GET /{ticker}/create/](../api/tickercreate): Create New Payment Address

**Parameter Notes:** 
* **`callback`** - Add query parameters to help track payments when receiving webhooks (e.g., `?order_id=123&user_id=456`). Also add an unguessable `nonce` that you store and verify in your webhook handler, and reject any callback whose value you don't recognize.
* **`address`** - Your wallet address where payments will be forwarded
* **`pending`** - Set to `1` to receive webhooks for unconfirmed transactions (recommended for better UX)
* **`convert`** - Set to `1` to automatically convert received payments to your preferred currency
* **`post`** - Set to `1` to receive webhooks via POST instead of GET requests (default is GET)
* **`json`** - Set to `1` to receive webhook data in JSON format instead of URL-encoded parameters (works with both GET and POST)
* **`multi_token`** - Only relevant for blockchains with tokens (Ethereum, Solana, Tron). Set to `1` to accept multiple token types

**Payment Splitting:**
To split payments between multiple addresses, use: `percentage_1@address_1|percentage_2@address_2`
Example: `0.5@ADDRESS_1|0.5@ADDRESS_2` splits 50/50 between two addresses.

**Response:**
```json
{
  "address_in": "14PqCsA7KMgseZMPwg6mJy754MtQkrgszu",
  "address_out": "1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP",
  "callback_url": "https://yoursite.com/webhook?order_id=12345&nonce=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "priority": "default",
  "minimum_transaction_coin": 0.008,
  "status": "success"
}
```

> **WARNING**
>**Important:** Store both the `address_in` and `callback_url` values from the response:
> - **`address_in`** - The unique payment address your customer will send cryptocurrency to
> - **`callback_url`** - Acts as a permanent identifier that links to this specific payment setup
> 
> **Address Persistence:** The `callback_url` works as an "ID" that permanently associates with the `address_out` (your destination address). Once set, the `address_out` cannot be changed for that callback URL, even if you provide a different address in future API calls. This ensures payment consistency and prevents accidental address changes.
> 
> **Logs Integration:** The exact `callback_url` returned from this response can be used with the logs endpoint to track payments and transaction history without relying on webhooks.
> 
> **To change the destination address:** You must use a different `callback_url` (e.g., add a version parameter like `?order_id=123&v=2`) to create a new payment setup with a different `address_out`.


## Step 2: Display Payment Information

Create a payment interface that shows the customer how to complete their payment. You have two main scenarios depending on your use case:

### Scenario A: Exchange Deposits (Any Amount)
For exchanges or services accepting any amount above the minimum, fetch the minimum transaction requirements and display them to users.

### Scenario B: Ecommerce Payments (Specific Amount)
For stores with fixed prices, convert your fiat amount to cryptocurrency using real-time exchange rates.

Let's implement both scenarios:

> **INFO: Using Our Official Libraries**
>You can also use our official libraries for these API calls. Here's how you would get ticker info, convert currencies, and generate QR codes:
> 
> ```javascript
> // Using the official Node.js library
> const CryptAPI = require('@cryptapi/api');
> 
> // Get ticker information and minimums
> const tickerInfo = await CryptAPI.getInfo('btc', 'YOUR_API_KEY');
> // tickerInfo.minimum_transaction_coin
> 
> // Convert USD to BTC for ecommerce payments
> const conversion = await CryptAPI.getConvert('btc', usdAmount, 'USD', 'YOUR_API_KEY');
> // conversion.value_coin
> 
> // Get QR code for payment address
> const qrCode = await CryptAPI.getQrcode('btc', address, amount, size, 'YOUR_API_KEY');
> // qrCode.qr_code (base64 image)
> ```
> 
> ```php
> // Using the official PHP library
> // Get ticker information and minimums
> $tickerInfo = CryptAPI\CryptAPI::get_info('btc', 'YOUR_API_KEY');
> // $tickerInfo->minimum_transaction_coin
> 
> // Convert USD to BTC for ecommerce payments
> $conversion = CryptAPI\CryptAPI::get_convert('btc', $usdAmount, 'USD', 'YOUR_API_KEY');
> // $conversion->value_coin
> 
> // Get QR code for payment address
> $qrCode = CryptAPI\CryptAPI::get_qrcode('btc', $address, $amount, $size, 'YOUR_API_KEY');
> // $qrCode->qr_code (base64 image)
> ```
> 
> ```python
> # Using the official Python library
> from cryptapi import CryptAPIHelper
> 
> # Get ticker information and minimums
> ticker_info = CryptAPIHelper.get_info('btc', 'YOUR_API_KEY')
> # ticker_info['minimum_transaction_coin']
> 
> # Convert USD to BTC for ecommerce payments
> conversion = CryptAPIHelper.get_convert('btc', usd_amount, 'USD', 'YOUR_API_KEY')
> # conversion['value_coin']
> 
> # Get QR code for payment address
> qr_code = CryptAPIHelper.get_qrcode('btc', address, amount, size, 'YOUR_API_KEY')
> # qr_code['qr_code'] (base64 image)
> ```


```javascript
// Get ticker information and minimums
const getTickerInfo = async () => {
  const response = await fetch('https://api.cryptapi.io/btc/info/');
  const data = await response.json();
  return data;
};

// Convert USD to BTC for ecommerce payments
const convertAmount = async (usdAmount) => {
  const params = new URLSearchParams({
    value: usdAmount,
    from: 'USD'
  });
  
  const response = await fetch(`https://api.cryptapi.io/btc/convert/?${params}`);
  const data = await response.json();
  return data.value_coin; // BTC amount
};

// Get QR code for payment address
const getQRCode = async (address, amount = null) => {
  const params = new URLSearchParams({
    address: address,
    size: 200
  });
  
  if (amount) {
    params.append('value', amount);
  }
  
  const response = await fetch(`https://api.cryptapi.io/btc/qrcode/?${params}`);
  const data = await response.json();
  return data.qr_code; // Base64 image
};

// Display payment information - Exchange Deposits
const displayExchangeDeposit = async (paymentData) => {
  const tickerInfo = await getTickerInfo();
  const qrCode = await getQRCode(paymentData.address_in);
  
  const paymentContainer = document.getElementById('payment-container');
  paymentContainer.innerHTML = `
    <div class="payment-info">
      <h3>Deposit Bitcoin</h3>
      <div class="payment-details">
        <p><strong>Minimum Deposit:</strong> ${tickerInfo.minimum_transaction_coin} BTC</p>
        <p><strong>Send Bitcoin to:</strong></p>
        <div class="address-container">
          <code>${paymentData.address_in}</code>
          <button onclick="copyAddress('${paymentData.address_in}')">Copy</button>
        </div>
        <div class="qr-code">
          <img src="data:image/png;base64,${qrCode}" alt="Payment QR Code" />
        </div>
        <p class="warning">⚠️ Send only amounts above ${tickerInfo.minimum_transaction_coin} BTC</p>
      </div>
      <div class="payment-status">
        <p id="status">⏳ Waiting for deposit...</p>
      </div>
    </div>
  `;
};

// Display payment information - Ecommerce Payment
const displayEcommercePayment = async (paymentData, usdAmount) => {
  const btcAmount = await convertAmount(usdAmount);
  const tickerInfo = await getTickerInfo();
  const minimumAmount = tickerInfo.minimum_transaction_coin;
  
  // Validate minimum amount
  if (btcAmount < minimumAmount) {
    const paymentContainer = document.getElementById('payment-container');
    paymentContainer.innerHTML = `
      <div class="payment-error">
        <h3>❌ Payment Amount Too Low</h3>
        <div class="error-details">
          <p><strong>Your payment amount:</strong> ${btcAmount} BTC</p>
          <p><strong>Minimum required:</strong> ${minimumAmount} BTC</p>
          <p class="warning">⚠️ Payments below the minimum will be lost. Please increase your order amount.</p>
        </div>
      </div>
    `;
    return;
  }
  
  const qrCode = await getQRCode(paymentData.address_in, btcAmount);
  
  const paymentContainer = document.getElementById('payment-container');
  paymentContainer.innerHTML = `
    <div class="payment-info">
      <h3>Complete Your Payment</h3>
      <div class="payment-details">
        <p><strong>Amount:</strong> $${usdAmount} USD (${btcAmount} BTC)</p>
        <p><strong>Send exactly:</strong></p>
        <div class="amount-container">
          <code>${btcAmount} BTC</code>
          <button onclick="copyAmount('${btcAmount}')">Copy Amount</button>
        </div>
        <p><strong>To address:</strong></p>
        <div class="address-container">
          <code>${paymentData.address_in}</code>
          <button onclick="copyAddress('${paymentData.address_in}')">Copy Address</button>
        </div>
        <div class="qr-code">
          <img src="data:image/png;base64,${qrCode}" alt="Payment QR Code" />
          <p><small>QR code includes amount and address</small></p>
        </div>
        <p class="minimum-warning">⚠️ Minimum transaction amount: ${minimumAmount} BTC</p>
      </div>
      <div class="payment-status">
        <p id="status">⏳ Waiting for payment...</p>
      </div>
    </div>
  `;
};

const copyAddress = (address) => {
  navigator.clipboard.writeText(address);
  alert('Address copied to clipboard!');
};

const copyAmount = (amount) => {
  navigator.clipboard.writeText(amount);
  alert('Amount copied to clipboard!');
};
```

```php
<?php
// Get ticker information and minimums
function getTickerInfo() {
    $url = 'https://api.cryptapi.io/btc/info/';
    $result = file_get_contents($url);
    return json_decode($result, true);
}

// Convert USD to BTC for ecommerce payments
function convertAmount($usdAmount) {
    $params = http_build_query([
        'value' => $usdAmount,
        'from' => 'USD'
    ]);
    
    $url = 'https://api.cryptapi.io/btc/convert/?' . $params;
    $result = file_get_contents($url);
    $data = json_decode($result, true);
    return $data['value_coin']; // BTC amount
}

// Get QR code for payment address
function getQRCode($address, $amount = null) {
    $params = [
        'address' => $address,
        'size' => 200
    ];
    
    if ($amount) {
        $params['value'] = $amount;
    }
    
    $url = 'https://api.cryptapi.io/btc/qrcode/?' . http_build_query($params);
    $result = file_get_contents($url);
    $data = json_decode($result, true);
    return $data['qr_code']; // Base64 image
}

// Display payment information - Exchange Deposits
function displayExchangeDeposit($paymentData) {
    $tickerInfo = getTickerInfo();
    $qrCode = getQRCode($paymentData['address_in']);
    $address = htmlspecialchars($paymentData['address_in']);
    $minimum = $tickerInfo['minimum_transaction_coin'];
    
    echo "
    <div class='payment-info'>
        <h3>Deposit Bitcoin</h3>
        <div class='payment-details'>
            <p><strong>Minimum Deposit:</strong> $minimum BTC</p>
            <p><strong>Send Bitcoin to:</strong></p>
            <div class='address-container'>
                <code>$address</code>
                <button onclick='copyAddress(\"$address\")'>Copy</button>
            </div>
            <div class='qr-code'>
                <img src='data:image/png;base64,$qrCode' alt='Payment QR Code' />
            </div>
            <p class='warning'>⚠️ Send only amounts above $minimum BTC</p>
        </div>
        <div class='payment-status'>
            <p id='status'>⏳ Waiting for deposit...</p>
        </div>
    </div>
    ";
}

// Display payment information - Ecommerce Payment
function displayEcommercePayment($paymentData, $usdAmount) {
    $btcAmount = convertAmount($usdAmount);
    $tickerInfo = getTickerInfo();
    $minimumAmount = $tickerInfo['minimum_transaction_coin'];
    
    // Validate minimum amount
    if ($btcAmount < $minimumAmount) {
        echo "
        <div class='payment-error'>
            <h3>❌ Payment Amount Too Low</h3>
            <div class='error-details'>
                <p><strong>Your payment amount:</strong> $btcAmount BTC</p>
                <p><strong>Minimum required:</strong> $minimumAmount BTC</p>
                <p class='warning'>⚠️ Payments below the minimum will be lost. Please increase your order amount.</p>
            </div>
        </div>
        ";
        return;
    }
    
    $qrCode = getQRCode($paymentData['address_in'], $btcAmount);
    $address = htmlspecialchars($paymentData['address_in']);
    
    echo "
    <div class='payment-info'>
        <h3>Complete Your Payment</h3>
        <div class='payment-details'>
            <p><strong>Amount:</strong> $$usdAmount USD ($btcAmount BTC)</p>
            <p><strong>Send exactly:</strong></p>
            <div class='amount-container'>
                <code>$btcAmount BTC</code>
                <button onclick='copyAmount(\"$btcAmount\")'>Copy Amount</button>
            </div>
            <p><strong>To address:</strong></p>
            <div class='address-container'>
                <code>$address</code>
                <button onclick='copyAddress(\"$address\")'>Copy Address</button>
            </div>
            <div class='qr-code'>
                <img src='data:image/png;base64,$qrCode' alt='Payment QR Code' />
                <p><small>QR code includes amount and address</small></p>
            </div>
            <p class='minimum-warning'>⚠️ Minimum transaction amount: $minimumAmount BTC</p>
        </div>
        <div class='payment-status'>
            <p id='status'>⏳ Waiting for payment...</p>
        </div>
    </div>
    ";
}
?>
```

```python
import requests

# Get ticker information and minimums
def get_ticker_info():
    response = requests.get('https://api.cryptapi.io/btc/info/')
    return response.json()

# Convert USD to BTC for ecommerce payments
def convert_amount(usd_amount):
    params = {
        'value': usd_amount,
        'from': 'USD'
    }
    response = requests.get('https://api.cryptapi.io/btc/convert/', params=params)
    data = response.json()
    return data['value_coin']  # BTC amount

# Get QR code for payment address
def get_qr_code(address, amount=None):
    params = {
        'address': address,
        'size': 200
    }
    if amount:
        params['value'] = amount
    
    response = requests.get('https://api.cryptapi.io/btc/qrcode/', params=params)
    data = response.json()
    return data['qr_code']  # Base64 image

# Display payment information - Exchange Deposits
def display_exchange_deposit(payment_data):
    ticker_info = get_ticker_info()
    qr_code = get_qr_code(payment_data['address_in'])
    
    context = {
        'address': payment_data['address_in'],
        'minimum': ticker_info['minimum_transaction_coin'],
        'qr_code': qr_code
    }
    return render_template('exchange_deposit.html', **context)

# Display payment information - Ecommerce Payment
def display_ecommerce_payment(payment_data, usd_amount):
    btc_amount = convert_amount(usd_amount)
    ticker_info = get_ticker_info()
    minimum_amount = ticker_info['minimum_transaction_coin']
    
    # Validate minimum amount
    if btc_amount < minimum_amount:
        context = {
            'error': True,
            'payment_amount': btc_amount,
            'minimum_amount': minimum_amount
        }
        return render_template('payment_error.html', **context)
    
    qr_code = get_qr_code(payment_data['address_in'], btc_amount)
    
    context = {
        'address': payment_data['address_in'],
        'usd_amount': usd_amount,
        'btc_amount': btc_amount,
        'qr_code': qr_code,
        'minimum_amount': minimum_amount
    }
    return render_template('ecommerce_payment.html', **context)

# exchange_deposit.html template
"""
<div class="payment-info">
    <h3>Deposit Bitcoin</h3>
    <div class="payment-details">
        <p><strong>Minimum Deposit:</strong> {{ minimum }} BTC</p>
        <p><strong>Send Bitcoin to:</strong></p>
        <div class="address-container">
            <code>{{ address }}</code>
            <button onclick="copyAddress('{{ address }}')">Copy</button>
        </div>
        <div class="qr-code">
            <img src="data:image/png;base64,{{ qr_code }}" alt="Payment QR Code" />
        </div>
        <p class="warning">⚠️ Send only amounts above {{ minimum }} BTC</p>
    </div>
    <div class="payment-status">
        <p id="status">⏳ Waiting for deposit...</p>
    </div>
</div>
"""

# payment_error.html template
"""
<div class="payment-error">
    <h3>❌ Payment Amount Too Low</h3>
    <div class="error-details">
        <p><strong>Your payment amount:</strong> {{ payment_amount }} BTC</p>
        <p><strong>Minimum required:</strong> {{ minimum_amount }} BTC</p>
        <p class="warning">⚠️ Payments below the minimum will be lost. Please increase your order amount.</p>
    </div>
</div>
"""

# ecommerce_payment.html template
"""
<div class="payment-info">
    <h3>Complete Your Payment</h3>
    <div class="payment-details">
        <p><strong>Amount:</strong> ${{ usd_amount }} USD ({{ btc_amount }} BTC)</p>
        <p><strong>Send exactly:</strong></p>
        <div class="amount-container">
            <code>{{ btc_amount }} BTC</code>
            <button onclick="copyAmount('{{ btc_amount }}')">Copy Amount</button>
        </div>
        <p><strong>To address:</strong></p>
        <div class="address-container">
            <code>{{ address }}</code>
            <button onclick="copyAddress('{{ address }}')">Copy Address</button>
        </div>
        <div class="qr-code">
            <img src="data:image/png;base64,{{ qr_code }}" alt="Payment QR Code" />
            <p><small>QR code includes amount and address</small></p>
        </div>
        <p class="minimum-warning">⚠️ Minimum transaction amount: {{ minimum_amount }} BTC</p>
    </div>
    <div class="payment-status">
        <p id="status">⏳ Waiting for payment...</p>
    </div>
</div>
"""
```

```ruby
# Using Rails/Sinatra
def display_payment(payment_data, amount)
  @address = payment_data['address_in']
  @amount = amount
  
  # Get minimum transaction amount
  require 'net/http'
  require 'json'
  
  uri = URI("https://api.cryptapi.io/btc/info/")
  response = Net::HTTP.get(uri)
  ticker_info = JSON.parse(response)
  @minimum_amount = ticker_info['minimum_transaction_coin']
  
  @qr_url = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=#{@address}"
  
  erb :payment
end

# payment.erb template
"""
<div class="payment-info">
    <h3>Complete Your Payment</h3>
    <div class="payment-details">
        <p><strong>Amount:</strong> <%= @amount %> USD</p>
        <p><strong>Send Bitcoin to:</strong></p>
        <div class="address-container">
            <code><%= @address %></code>
            <button onclick="copyAddress('<%= @address %>')">Copy</button>
        </div>
        <div class="qr-code">
            <img src="<%= @qr_url %>" alt="Payment QR Code" />
        </div>
        <p class="minimum-warning">⚠️ Minimum transaction amount: <%= @minimum_amount %> BTC</p>
    </div>
    <div class="payment-status">
        <p id="status">⏳ Waiting for payment...</p>
    </div>
</div>
"""
```

```csharp
// Using ASP.NET Core
public class PaymentViewModel
{
    public string Address { get; set; }
    public decimal Amount { get; set; }
    public string QrUrl { get; set; }
    public decimal MinimumAmount { get; set; }
}

public async Task<IActionResult> DisplayPayment(dynamic paymentData, decimal amount)
{
    // Get minimum transaction amount
    using var client = new HttpClient();
            var response = await client.GetAsync("https://api.cryptapi.io/btc/info/");
    var result = await response.Content.ReadAsStringAsync();
    var tickerInfo = JsonConvert.DeserializeObject<dynamic>(result);
    var minimumAmount = tickerInfo.minimum_transaction_coin;
    
    var model = new PaymentViewModel
    {
        Address = paymentData.address_in,
        Amount = amount,
        QrUrl = $"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={paymentData.address_in}",
        MinimumAmount = minimumAmount
    };
    
    return View(model);
}
```

```java
// Using Spring Boot
@GetMapping("/payment")
public String displayPayment(Model model, 
                           @RequestParam String address, 
                           @RequestParam double amount) {
    // Get minimum transaction amount
    RestTemplate restTemplate = new RestTemplate();
            String url = "https://api.cryptapi.io/btc/info/";
    ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
    Map<String, Object> tickerInfo = response.getBody();
    double minimumAmount = (Double) tickerInfo.get("minimum_transaction_coin");
    
    model.addAttribute("address", address);
    model.addAttribute("amount", amount);
    model.addAttribute("minimumAmount", minimumAmount);
    model.addAttribute("qrUrl", 
        "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + address);
    
    return "payment";
}
```

```go
// Using Go templates
type PaymentData struct {
    Address       string
    Amount        float64
    QrUrl         string
    MinimumAmount float64
}

func displayPayment(w http.ResponseWriter, address string, amount float64) {
    // Get minimum transaction amount
    resp, err := http.Get("https://api.cryptapi.io/btc/info/")
    if err != nil {
        http.Error(w, "Failed to get minimum amount", http.StatusInternalServerError)
        return
    }
    defer resp.Body.Close()
    
    var tickerInfo map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&tickerInfo)
    minimumAmount := tickerInfo["minimum_transaction_coin"].(float64)
    
    data := PaymentData{
        Address:       address,
        Amount:        amount,
        QrUrl:         fmt.Sprintf("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=%s", address),
        MinimumAmount: minimumAmount,
    }
    
    tmpl := template.Must(template.ParseFiles("payment.html"))
    tmpl.Execute(w, data)
}
```

```bash
# Get minimum transaction amount first
MINIMUM_AMOUNT=$(curl -s "https://api.cryptapi.io/btc/info/" | jq -r '.minimum_transaction_coin')

# Static HTML example with minimum amount
echo '<div class="payment-info">
    <h3>Complete Your Payment</h3>
    <div class="payment-details">
        <p><strong>Amount:</strong> $AMOUNT USD</p>
        <p><strong>Send Bitcoin to:</strong></p>
        <div class="address-container">
            <code>$ADDRESS</code>
            <button onclick="copyAddress('"'"'$ADDRESS'"'"')">Copy</button>
        </div>
        <div class="qr-code">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=$ADDRESS" alt="Payment QR Code" />
        </div>
        <p class="minimum-warning">⚠️ Minimum transaction amount: '"'"'$MINIMUM_AMOUNT'"'"' BTC</p>
    </div>
    <div class="payment-status">
        <p id="status">⏳ Waiting for payment...</p>
    </div>
</div>' > payment.html
```

### Key API Endpoints Used

The examples above integrate with these CryptAPI API endpoints:

1. **[GET /{ticker}/info/](../api/tickerinfo)** - Get minimum transaction amounts and ticker information
2. **[GET /{ticker}/convert/](../api/tickerconvert)** - Convert fiat amounts to cryptocurrency 
3. **[GET /{ticker}/qrcode/](../api/tickerqrcode)** - Generate QR codes with optional amount embedding

### Implementation Notes

**For Exchange Deposits:**
- Fetch minimum transaction requirements using the info endpoint
- Display address-only QR codes (no fixed amount)
- **Always display minimum deposit requirements prominently** - this is critical to prevent fund loss
- Accept any amount above the minimum
- **Warn users that amounts below minimum will be lost**

**For Ecommerce Payments:**
- Convert fiat prices to cryptocurrency using current exchange rates
- Generate QR codes that include both address and exact amount
- Display both fiat and crypto amounts for clarity
- Provide separate copy buttons for address and amount
- **Verify the converted amount is above the minimum transaction threshold**
- **Always display minimum transaction amount prominently** - even for fixed amounts, users need to know the minimum

**Minimum Transaction Amount Handling:**
- **Always fetch and display minimum amounts** from the info endpoint for your chosen cryptocurrency
- **Always show minimum requirements in your UI** - this is not optional, it prevents fund loss
- **Validate amounts before accepting payments** - if a user's payment would be below minimum, show an error
- **Display clear warnings** about minimum requirements in your UI
- **For ecommerce payments**, ensure your fiat price converts to an amount above the minimum

> **WARNING**
>**Critical: Minimum Transaction Amounts**
> 
> **Why this matters:** Every cryptocurrency has minimum transaction amounts that vary by blockchain. Transactions below these minimums are **ignored by CryptAPI systems and funds will be permanently lost**.
> 
> **What you must do:**
> 1. **Always fetch minimum amounts** using the info endpoint for your chosen cryptocurrency
> 2. **Display minimum requirements prominently** in your payment UI
> 3. **Validate amounts before accepting payments** - show errors for amounts below minimum
> 
> **Example validation:**
> ```javascript
> // Check if amount meets minimum requirements
> const tickerInfo = await getTickerInfo();
> const minimumAmount = tickerInfo.minimum_transaction_coin;
> 
> if (paymentAmount < minimumAmount) {
>   showError(`Amount too low. Minimum required: ${minimumAmount} ${ticker.toUpperCase()}`);
>   return;
> }
> ```
> 
> **For ecommerce:** Ensure your fiat prices convert to amounts above the minimum. Consider adjusting prices or adding minimum order amounts if necessary.


> **INFO**
>**QR Code Value Parameter:** The `value` parameter in QR codes may not be compatible with all wallets and exchanges. Some may ignore the amount field, so always display the amount separately as well.


> **INFO**
>**Template Updates Required:** For the Ruby, C#, Java, Go, and Bash examples above, you'll need to update your payment templates to include the minimum amount display. Add this line to your templates:
> 
> ```html
> <p class="minimum-warning">⚠️ Minimum transaction amount: [MINIMUM_AMOUNT] [CURRENCY]</p>
> ```
> 
> Replace `[MINIMUM_AMOUNT]` and `[CURRENCY]` with the appropriate template variables for your framework.


> **WARNING**
>**Real-time User Notifications:** You should implement an automated way to notify users when their payment/deposit has been received. When CryptAPI sends a webhook notification, update your UI immediately to show the payment status change. Consider using:
> 
> - **WebSockets** - For real-time browser updates
> - **Server-Sent Events (SSE)** - For live status updates
> - **Email notifications** - For payment confirmations
> - **Push notifications** - For mobile apps
> - **Database polling** - As a fallback method
> 
> Users expect immediate feedback when they send a payment, so don't rely on manual page refreshes!



## Step 3: Track Payments

You can track payments using two methods: **Webhooks** (recommended) or **Logs Endpoint** (polling). Most applications use webhooks for real-time updates, but the logs endpoint is useful for troubleshooting or as a backup method.

### Method 1: Webhooks (Recommended)

Set up webhook endpoints to receive real-time notifications when payments are received. CryptAPI sends two types of webhooks:

#### Webhook Types:
- **Pending** - Payment detected in mempool but not yet confirmed (particularly useful for slower blockchains like Bitcoin, Litecoin, and Bitcoin Cash)
- **Confirmed** - Payment has received the number of confirmations specified in the `confirmations` parameter when creating the payment address

For complete webhook field documentation, see **[Custom Payment Flow Webhooks](/webhooks/custom-payment-flow-webhooks)** - includes all fields, examples, and implementation details.

> **INFO: Tracking Payments with Custom Parameters**
>When creating custom payment flow payments, always add your own query parameters to the `callback` URL to track which order or user the payment belongs to (e.g., `?order_id=123` or `?user_id=456`).
> 
> These custom parameters are delivered as URL query parameters in your webhook, even when you use `post=1` and/or `json=1`. Read them from your framework's query parameters (e.g., `req.query.order_id`).


> **WARNING: Harden your integration with a secret**
>Beyond tracking identifiers, add an unguessable value unique to each payment (for example `?nonce=a1b2c3...`) to your `callback` URL, and store it on your side. CryptAPI returns it unchanged in every callback, so you verify it in your webhook handler and reject any callback whose value you don't recognize. Use this together with [webhook signature verification](/webhooks/verify-webhook-signature), not instead of it.


> **INFO**
>**Webhook Method & Format:** You control how webhooks are delivered when creating the payment:
> 
> - **Default:** GET requests with URL-encoded parameters
> - **`post=1`:** POST requests with data in request body  
> - **`json=1`:** JSON format (works with both GET and POST)
> - **`post=1&json=1`:** POST requests with JSON data in body
> 
> Your webhook endpoint should handle the format you choose during payment creation.


#### Webhook Implementation:

```javascript
// Express.js webhook handler - handles both GET and POST
app.all('/webhook', express.json(), (req, res) => {
  // Handle both GET (default) and POST (if post=1 was set)
  const webhookData = req.method === 'GET' ? req.query : req.body;
  const { 
    uuid,
    address_in, 
    address_out, 
    txid_in, 
    txid_out, 
    confirmations, 
    value_coin, 
    value_coin_convert,
    value_forwarded_coin,
    value_forwarded_coin_convert,
    fee_coin,
    coin,
    price,
    pending
  } = webhookData;
  // Custom parameters are ALWAYS delivered via the query string
  const { order_id, user_id, nonce } = req.query;
  
  // Note: order_id and user_id come from the callback URL query string
  
  // Verify the nonce against the value you stored, rejecting anything you don't recognize
  // (defense in depth on top of signature verification)
  if (nonce !== getStoredNonce(order_id)) {
    return res.status(403).send('Invalid nonce');
  }
  
  // Check if we've already processed this transaction
  const alreadyProcessed = checkTransactionInDatabase(uuid);
  
  if (!alreadyProcessed) {
    if (pending === 1) {
      // Payment detected but not confirmed
      console.log(`Pending payment for ${order_id || user_id}: ${value_coin} ${coin.toUpperCase()} to ${address_in}`);
      console.log(`UUID: ${uuid}, Price: $${price}`);
      
      // Store transaction in database with UUID
      storeTransaction({
        uuid: uuid,
        address_in: address_in,
        address_out: address_out,
        txid_in: txid_in,
        amount: value_coin,
        coin: coin,
        price: price,
        status: 'pending',
        value_coin_convert: value_coin_convert,
        processed_at: new Date()
      });
      
      // Notify user (WebSocket, email, etc.)
      notifyUser(address_in, 'pending', {
        uuid: uuid,
        amount: value_coin,
        coin: coin,
        usd_value: value_coin_convert ? JSON.parse(value_coin_convert).USD : null
      });
      
    } else if (pending === 0) {
      // Payment confirmed
      console.log(`Confirmed payment for ${order_id || user_id}: ${value_coin} ${coin.toUpperCase()} to ${address_in}`);
      console.log(`UUID: ${uuid}, Forwarded: ${value_forwarded_coin}, Fee: ${fee_coin}`);
      
      // Update database
      updateTransaction(uuid, {
        txid_out: txid_out,
        confirmations: confirmations,
        value_forwarded_coin: value_forwarded_coin,
        value_forwarded_coin_convert: value_forwarded_coin_convert,
        fee_coin: fee_coin,
        status: 'confirmed',
        confirmed_at: new Date()
      });
      
      // Process order, send confirmation email, etc.
      processSuccessfulPayment(uuid, {
        orderId: order_id,
        userId: user_id,
        amount: value_coin,
        forwarded_amount: value_forwarded_coin,
        fee: fee_coin,
        coin: coin,
        confirmations: confirmations
      });
      
      // Notify user
      notifyUser(address_in, 'confirmed', {
        uuid: uuid,
        amount: value_coin,
        forwarded_amount: value_forwarded_coin,
        coin: coin,
        confirmations: confirmations
      });
    }
  } else {
    console.log(`Duplicate webhook received for UUID: ${uuid}`);
  }
  
  // Always respond with *ok* or HTTP 200 to stop retries
  res.status(200).send('*ok*');
});
```

```php
<?php
// webhook.php - handles both GET and POST
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // GET request (default) - data in query parameters
    $data = $_GET;
} else {
    // POST request (if post=1 was set) - data in body
    $input = file_get_contents('php://input');
    if ($_GET['json'] ?? false) {
        // JSON format (if json=1 was set)
        $data = json_decode($input, true);
    } else {
        // URL-encoded format (default)
        parse_str($input, $data);
    }
}

$address_in = $data['address_in'];
$address_out = $data['address_out'];
$txid_in = $data['txid_in'];
$txid_out = $data['txid_out'];
$confirmations = $data['confirmations'];
$value = $data['value'];
$value_coin = $data['value_coin'];
$pending = $data['pending'];
// Custom parameters are ALWAYS delivered via the query string
$order_id = $_GET['order_id'] ?? ($data['order_id'] ?? null);
$user_id = $_GET['user_id'] ?? ($data['user_id'] ?? null);
$nonce = $_GET['nonce'] ?? ($data['nonce'] ?? null);

// Verify the nonce against the value you stored, rejecting anything you don't recognize
// (defense in depth on top of signature verification)
if ($nonce !== getStoredNonce($order_id)) {
    http_response_code(403);
    exit('Invalid nonce');
}

if ($pending === 1) {
    // Payment detected but not confirmed
    $identifier = $order_id ?? $user_id ?? 'unknown';
    error_log("Pending payment for {$identifier}: {$value_coin} BTC to {$address_in}");
    
    // Update database
    updatePaymentStatus($address_in, 'pending', [
        'txid' => $txid_in,
        'amount' => $value_coin,
        'confirmations' => $confirmations
    ]);
    
    // Notify user
    notifyUser($address_in, 'pending');
    
} elseif ($confirmations >= 1) {
    // Payment confirmed
    $identifier = $order_id ?? $user_id ?? 'unknown';
    error_log("Confirmed payment for {$identifier}: {$value_coin} BTC to {$address_in}");
    
    // Update database
    updatePaymentStatus($address_in, 'confirmed', [
        'txid' => $txid_in,
        'amount' => $value_coin,
        'confirmations' => $confirmations
    ]);
    
    // Process order
    processSuccessfulPayment($address_in);
    
    // Notify user
    notifyUser($address_in, 'confirmed');
}

http_response_code(200);
echo 'OK';

function updatePaymentStatus($address, $status, $data) {
    // Update your database here
    // Example: UPDATE payments SET status = ?, data = ? WHERE address = ?
}

function processSuccessfulPayment($address) {
    // Process the successful payment
    // Send confirmation email, fulfill order, etc.
}

function notifyUser($address, $status) {
    // Notify user via WebSocket, email, etc.
}

function getStoredNonce($orderId) {
    // Look up the nonce you stored when creating the payment
    // Example: SELECT nonce FROM payments WHERE order_id = ?
}
?>
```

```python
# Flask webhook handler
from flask import Flask, request, jsonify
import json

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.get_json(silent=True) or {}
    
    address_in = data['address_in']
    address_out = data['address_out']
    txid_in = data['txid_in']
    txid_out = data['txid_out']
    confirmations = data['confirmations']
    value = data['value']
    value_coin = data['value_coin']
    pending = data['pending']
    # Custom parameters are ALWAYS delivered via the query string
    order_id = request.args.get('order_id') or data.get('order_id')
    user_id = request.args.get('user_id') or data.get('user_id')
    nonce = request.args.get('nonce') or data.get('nonce')
    
    # Verify the nonce against the value you stored, rejecting anything you don't recognize
    # (defense in depth on top of signature verification)
    if nonce != get_stored_nonce(order_id):
        return 'Invalid nonce', 403
    
    if pending == 1:
        # Payment detected but not confirmed
        identifier = order_id or user_id or 'unknown'
        print(f"Pending payment for {identifier}: {value_coin} BTC to {address_in}")
        
        // Update database
        update_payment_status(address_in, 'pending', {
            'txid': txid_in,
            'amount': value_coin,
            'confirmations': confirmations
        })
        
        // Notify user
        notify_user(address_in, 'pending')
        
    elif confirmations >= 1:
        # Payment confirmed
        identifier = order_id or user_id or 'unknown'
        print(f"Confirmed payment for {identifier}: {value_coin} BTC to {address_in}")
        
        // Update database
        update_payment_status(address_in, 'confirmed', {
            'txid': txid_in,
            'amount': value_coin,
            'confirmations': confirmations
        })
        
        // Process order
        process_successful_payment(address_in)
        
        // Notify user
        notify_user(address_in, 'confirmed')
    
    return jsonify({'status': 'ok'}), 200

def update_payment_status(address, status, data):
    // Update your database here
    pass

def process_successful_payment(address):
    // Process the successful payment
    pass

def notify_user(address, status):
    // Notify user via WebSocket, email, etc.
    pass

def get_stored_nonce(order_id):
    # Look up the nonce you stored when creating the payment
    # Example: SELECT nonce FROM payments WHERE order_id = ?
    pass
```

```ruby
# Sinatra webhook handler
post '/webhook' do
  data = JSON.parse(request.body.read)
  
  address_in = data['address_in']
  address_out = data['address_out']
  txid_in = data['txid_in']
  txid_out = data['txid_out']
  confirmations = data['confirmations']
  value = data['value']
  value_coin = data['value_coin']
  pending = data['pending']
  # Custom parameters (order_id, nonce) are ALWAYS delivered via the query string
  nonce = params['nonce']
  
  # Verify the nonce against the value you stored, rejecting anything you don't recognize
  # (defense in depth on top of signature verification)
  halt 403, 'Invalid nonce' if nonce != stored_nonce(params['order_id'])
  
  if pending == 1
    // Payment detected but not confirmed
    puts "Pending payment: #{value_coin} BTC to #{address_in}"
    
    // Update database
    update_payment_status(address_in, 'pending', {
      txid: txid_in,
      amount: value_coin,
      confirmations: confirmations
    })
    
    // Notify user
    notify_user(address_in, 'pending')
    
  elsif confirmations >= 1
    // Payment confirmed
    puts "Confirmed payment: #{value_coin} BTC to #{address_in}"
    
    // Update database
    update_payment_status(address_in, 'confirmed', {
      txid: txid_in,
      amount: value_coin,
      confirmations: confirmations
    })
    
    // Process order
    process_successful_payment(address_in)
    
    // Notify user
    notify_user(address_in, 'confirmed')
  end
  
  status 200
  'OK'
end
```

```csharp
// ASP.NET Core webhook handler
[HttpPost("webhook")]
public IActionResult Webhook([FromBody] WebhookData data, [FromQuery] string order_id, [FromQuery] string nonce)
{
    // Verify the nonce against the value you stored, rejecting anything you don't recognize
    // (defense in depth on top of signature verification)
    if (nonce != GetStoredNonce(order_id))
    {
        return StatusCode(403, "Invalid nonce");
    }

    if (data.Pending == 1)
    {
        // Payment detected but not confirmed
        _logger.LogInformation($"Pending payment: {data.ValueCoin} BTC to {data.AddressIn}");
        
        // Update database
        UpdatePaymentStatus(data.AddressIn, "pending", new {
            Txid = data.TxidIn,
            Amount = data.ValueCoin,
            Confirmations = data.Confirmations
        });
        
        // Notify user
        NotifyUser(data.AddressIn, "pending");
    }
    else if (data.Confirmations >= 1)
    {
        // Payment confirmed
        _logger.LogInformation($"Confirmed payment: {data.ValueCoin} BTC to {data.AddressIn}");
        
        // Update database
        UpdatePaymentStatus(data.AddressIn, "confirmed", new {
            Txid = data.TxidIn,
            Amount = data.ValueCoin,
            Confirmations = data.Confirmations
        });
        
        // Process order
        ProcessSuccessfulPayment(data.AddressIn);
        
        // Notify user
        NotifyUser(data.AddressIn, "confirmed");
    }
    
    return Ok("OK");
}

public class WebhookData
{
    public string AddressIn { get; set; }
    public string AddressOut { get; set; }
    public string TxidIn { get; set; }
    public string TxidOut { get; set; }
    public int Confirmations { get; set; }
    public decimal Value { get; set; }
    public decimal ValueCoin { get; set; }
    public int Pending { get; set; }
}
```

```java
// Spring Boot webhook handler
@PostMapping("/webhook")
public ResponseEntity<String> webhook(@RequestBody WebhookData data,
                                      @RequestParam(required = false) String order_id,
                                      @RequestParam(required = false) String nonce) {
    // Verify the nonce against the value you stored, rejecting anything you don't recognize
    // (defense in depth on top of signature verification)
    if (!java.util.Objects.equals(nonce, getStoredNonce(order_id))) {
        return ResponseEntity.status(403).body("Invalid nonce");
    }

    if (data.getPending() == 1) {
        // Payment detected but not confirmed
        logger.info("Pending payment: {} BTC to {}", 
                   data.getValueCoin(), data.getAddressIn());
        
        // Update database
        updatePaymentStatus(data.getAddressIn(), "pending", 
                          Map.of("txid", data.getTxidIn(),
                                "amount", data.getValueCoin(),
                                "confirmations", data.getConfirmations()));
        
        // Notify user
        notifyUser(data.getAddressIn(), "pending");
        
    } else if (data.getConfirmations() >= 1) {
        // Payment confirmed
        logger.info("Confirmed payment: {} BTC to {}", 
                   data.getValueCoin(), data.getAddressIn());
        
        // Update database
        updatePaymentStatus(data.getAddressIn(), "confirmed",
                          Map.of("txid", data.getTxidIn(),
                                "amount", data.getValueCoin(),
                                "confirmations", data.getConfirmations()));
        
        // Process order
        processSuccessfulPayment(data.getAddressIn());
        
        // Notify user
        notifyUser(data.getAddressIn(), "confirmed");
    }
    
    return ResponseEntity.ok("OK");
}
```

```go
// Go webhook handler
func webhookHandler(w http.ResponseWriter, r *http.Request) {
    var data WebhookData
    
    body, err := ioutil.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "Bad request", http.StatusBadRequest)
        return
    }
    
    if err := json.Unmarshal(body, &data); err != nil {
        http.Error(w, "Bad request", http.StatusBadRequest)
        return
    }
    
    // Custom parameters (order_id, nonce) are ALWAYS delivered via the query string
    nonce := r.URL.Query().Get("nonce")
    orderID := r.URL.Query().Get("order_id")
    
    // Verify the nonce against the value you stored, rejecting anything you don't recognize
    // (defense in depth on top of signature verification)
    if nonce != getStoredNonce(orderID) {
        http.Error(w, "Invalid nonce", http.StatusForbidden)
        return
    }
    
    if data.Pending == 1 {
        // Payment detected but not confirmed
        log.Printf("Pending payment: %s BTC to %s", data.ValueCoin, data.AddressIn)
        
        // Update database
        updatePaymentStatus(data.AddressIn, "pending", map[string]interface{}{
            "txid":          data.TxidIn,
            "amount":        data.ValueCoin,
            "confirmations": data.Confirmations,
        })
        
        // Notify user
        notifyUser(data.AddressIn, "pending")
        
    } else if data.Confirmations >= 1 {
        // Payment confirmed
        log.Printf("Confirmed payment: %s BTC to %s", data.ValueCoin, data.AddressIn)
        
        // Update database
        updatePaymentStatus(data.AddressIn, "confirmed", map[string]interface{}{
            "txid":          data.TxidIn,
            "amount":        data.ValueCoin,
            "confirmations": data.Confirmations,
        })
        
        // Process order
        processSuccessfulPayment(data.AddressIn)
        
        // Notify user
        notifyUser(data.AddressIn, "confirmed")
    }
    
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

type WebhookData struct {
    AddressIn     string  `json:"address_in"`
    AddressOut    string  `json:"address_out"`
    TxidIn        string  `json:"txid_in"`
    TxidOut       string  `json:"txid_out"`
    Confirmations int     `json:"confirmations"`
    Value         float64 `json:"value"`
    ValueCoin     string  `json:"value_coin"`
    Pending       int     `json:"pending"`
}
```

```bash
# Test webhook locally with ngrok
ngrok http 3000

# Your webhook URL will be: https://abc123.ngrok.io/webhook
```

> **INFO**
>**Webhook Reliability & Security:**
> 
> **Response Requirements:**
> - Always respond with `*ok*` message or HTTP 200 status code to stop retries
> - CryptAPI uses exponential backoff: starts at 6 minutes, doubles each retry, stops after 3 days
> 
> **IP Whitelisting:**
> - Whitelist these CryptAPI server IPs: `51.77.105.132` and `135.125.112.47`
> - This prevents security systems (like Cloudflare) from blocking webhooks
> 
> **Secret Verification:**
> - Add an unguessable nonce/secret unique to each request to your `callback` URL and store it server-side
> - CryptAPI returns it unchanged in every callback, so reject any callback whose value you don't recognize
> - Use this together with [webhook signature verification](/webhooks/verify-webhook-signature), not instead of it
> 
> **Common Issues:**
> - Wrong token sent to address (e.g., created USDT address but sent TRX)
> - Callback URL not reachable online
> - Security systems blocking webhook requests
> 
> **Duplicate Prevention:**
> - Always check the `uuid` field to prevent processing the same transaction twice
> - Store UUIDs in your database before processing any payment


### Method 2: Logs Endpoint (Polling)

If webhooks aren't suitable for your setup, or as a backup method, you can use the logs endpoint to check payment status. This is particularly useful for troubleshooting webhook issues or implementing cron jobs to monitor payments.

> **INFO: Using Our Official Libraries**
>You can also check payment logs using our official libraries:
> 
> ```javascript
> // Using the official Node.js library
> const CryptAPI = require('@cryptapi/api');
> 
> const bb = new CryptAPI('btc', 'YOUR_WALLET_ADDRESS', callbackUrl, params, cryptapiParams);
> const logs = await bb.checkLogs();
> // logs.callbacks contains the payment history
> ```
> 
> ```php
> // Using the official PHP library
> $bb = new CryptAPI\CryptAPI('btc', 'YOUR_WALLET_ADDRESS', $callbackUrl, $params, $cryptapiParams);
> $logs = $bb->check_logs();
> // $logs->callbacks contains the payment history
> ```
> 
> ```python
> # Using the official Python library
> from cryptapi import CryptAPIHelper
> 
> bb = CryptAPIHelper('btc', 'YOUR_WALLET_ADDRESS', callback_url, params, bb_params)
> logs = bb.get_logs()
> # logs['callbacks'] contains the payment history
> ```


```javascript
// Check payment status using logs endpoint
const checkPaymentStatus = async (callbackUrl) => {
  const encodedCallback = encodeURIComponent(callbackUrl);
  const params = new URLSearchParams({
    callback: encodedCallback
  });
  
  const response = await fetch(`https://api.cryptapi.io/btc/logs/?${params}`);
  const data = await response.json();
  
  // Check if API request was successful
  if (data.status !== 'success') {
    console.error('API request failed:', data);
    return { error: 'API request failed' };
  }
  
  if (data.callbacks && data.callbacks.length > 0) {
    const processedTransactions = [];
    
    // Process each transaction
    for (const callback of data.callbacks) {
      // Check if transaction is confirmed (pending = 0 in logs)
      const confirmedLog = callback.logs.find(log => log.pending === 0);
      const isConfirmed = confirmedLog !== undefined;
      
      processedTransactions.push({
        uuid: callback.uuid || `${callback.txid_in}-${callback.value_coin}`, // Use UUID or fallback
        txid: callback.txid_in,
        amount: callback.value_coin,
        confirmations: callback.confirmations,
        status: callback.result,
        isConfirmed: isConfirmed,
        lastUpdate: callback.last_update
      });
    }
    
    return { transactions: processedTransactions };
  }
  
  return { transactions: [] };
};

// Process payments with duplicate prevention
const processPayments = async (callbackUrl) => {
  const result = await checkPaymentStatus(callbackUrl);
  
  if (result.error) {
    console.error('Failed to check payment status:', result.error);
    return;
  }
  
  for (const transaction of result.transactions) {
    // Check if we've already processed this transaction UUID
    const alreadyProcessed = await checkTransactionInDatabase(transaction.uuid);
    
    if (!alreadyProcessed) {
      if (transaction.isConfirmed && transaction.status === 'done') {
        console.log(`New confirmed payment: ${transaction.amount} BTC`);
        
        // Store transaction in database with UUID
        await storeTransaction({
          uuid: transaction.uuid,
          txid: transaction.txid,
          amount: transaction.amount,
          confirmations: transaction.confirmations,
          status: 'confirmed',
          processed_at: new Date()
        });
        
        // Process the payment (fulfill order, send confirmation, etc.)
        await processConfirmedPayment(transaction);
        
      } else if (transaction.status === 'pending') {
        console.log(`New pending payment: ${transaction.amount} BTC`);
        
        // Store as pending transaction
        await storeTransaction({
          uuid: transaction.uuid,
          txid: transaction.txid,
          amount: transaction.amount,
          confirmations: transaction.confirmations,
          status: 'pending',
          processed_at: new Date()
        });
        
        // Notify user of pending payment
        await notifyPendingPayment(transaction);
      }
    }
  }
};

// Helper functions (implement based on your database)
const checkTransactionInDatabase = async (uuid) => {
  // Check if transaction UUID exists in your database
  // Return true if exists, false if new
};

const storeTransaction = async (transactionData) => {
  // Store transaction in your database
  // Include the UUID to prevent duplicate processing
};

const processConfirmedPayment = async (transaction) => {
  // Process confirmed payment (fulfill order, send email, etc.)
};

const notifyPendingPayment = async (transaction) => {
  // Notify user of pending payment
};
```

```php
<?php
// Check payment status using logs endpoint
function checkPaymentStatus($callbackUrl) {
    $encodedCallback = urlencode($callbackUrl);
    $params = http_build_query([
        'callback' => $encodedCallback
    ]);
    
    $url = 'https://api.cryptapi.io/btc/logs/?' . $params;
    $result = file_get_contents($url);
    $data = json_decode($result, true);
    
    // Check if API request was successful
    if ($data['status'] !== 'success') {
        error_log('API request failed: ' . json_encode($data));
        return ['error' => 'API request failed'];
    }
    
    if (!empty($data['callbacks'])) {
        $processedTransactions = [];
        
        // Process each transaction
        foreach ($data['callbacks'] as $callback) {
            // Check if transaction is confirmed (pending = 0 in logs)
            $isConfirmed = false;
            foreach ($callback['logs'] as $log) {
                if ($log['pending'] == 0) {
                    $isConfirmed = true;
                    break;
                }
            }
            
            $processedTransactions[] = [
                'uuid' => $callback['uuid'] ?? $callback['txid_in'] . '-' . $callback['value_coin'],
                'txid' => $callback['txid_in'],
                'amount' => $callback['value_coin'],
                'confirmations' => $callback['confirmations'],
                'status' => $callback['result'],
                'isConfirmed' => $isConfirmed,
                'lastUpdate' => $callback['last_update']
            ];
        }
        
        return ['transactions' => $processedTransactions];
    }
    
    return ['transactions' => []];
}

// Process payments with duplicate prevention
function processPayments($callbackUrl) {
    $result = checkPaymentStatus($callbackUrl);
    
    if (isset($result['error'])) {
        error_log('Failed to check payment status: ' . $result['error']);
        return;
    }
    
    foreach ($result['transactions'] as $transaction) {
        // Check if we've already processed this transaction UUID
        $alreadyProcessed = checkTransactionInDatabase($transaction['uuid']);
        
        if (!$alreadyProcessed) {
            if ($transaction['isConfirmed'] && $transaction['status'] === 'done') {
                echo "New confirmed payment: " . $transaction['amount'] . " BTC\n";
                
                // Store transaction in database with UUID
                storeTransaction([
                    'uuid' => $transaction['uuid'],
                    'txid' => $transaction['txid'],
                    'amount' => $transaction['amount'],
                    'confirmations' => $transaction['confirmations'],
                    'status' => 'confirmed',
                    'processed_at' => date('Y-m-d H:i:s')
                ]);
                
                // Process the payment (fulfill order, send confirmation, etc.)
                processConfirmedPayment($transaction);
                
            } elseif ($transaction['status'] === 'pending') {
                echo "New pending payment: " . $transaction['amount'] . " BTC\n";
                
                // Store as pending transaction
                storeTransaction([
                    'uuid' => $transaction['uuid'],
                    'txid' => $transaction['txid'],
                    'amount' => $transaction['amount'],
                    'confirmations' => $transaction['confirmations'],
                    'status' => 'pending',
                    'processed_at' => date('Y-m-d H:i:s')
                ]);
                
                // Notify user of pending payment
                notifyPendingPayment($transaction);
            }
        }
    }
}

// Helper functions (implement based on your database)
function checkTransactionInDatabase($uuid) {
    // Check if transaction UUID exists in your database
    // Return true if exists, false if new
}

function storeTransaction($transactionData) {
    // Store transaction in your database
    // Include the UUID to prevent duplicate processing
}

function processConfirmedPayment($transaction) {
    // Process confirmed payment (fulfill order, send email, etc.)
}

function notifyPendingPayment($transaction) {
    // Notify user of pending payment
}
?>
```

```python
import requests
from urllib.parse import quote

def check_payment_status(callback_url):
    """Check payment status using logs endpoint"""
    encoded_callback = quote(callback_url)
    params = {
        'callback': encoded_callback
    }
    
    response = requests.get('https://api.cryptapi.io/btc/logs/', params=params)
    data = response.json()
    
    if data.get('callbacks'):
        latest_callback = data['callbacks'][0]
        
        return {
            'status': latest_callback['result'],
            'confirmations': latest_callback['confirmations'],
            'amount': latest_callback['value_coin'],
            'txid': latest_callback['txid_in']
        }
    
    return {'status': 'no_payments', 'confirmations': 0, 'amount': 0}

def poll_payment_status(callback_url):
    """Use in a cron job or polling function"""
    status = check_payment_status(callback_url)
    
    if status['status'] == 'done':
        print("Payment confirmed and processed!")
        # Update database, notify user, etc.
    elif status['status'] == 'pending':
        print("Payment detected but not confirmed yet")
        # Show pending status to user
```

```ruby
require 'net/http'
require 'json'
require 'uri'

def check_payment_status(callback_url)
  encoded_callback = URI.encode_www_form_component(callback_url)
  params = {
    callback: encoded_callback
  }
  
  query_string = URI.encode_www_form(params)
  uri = URI("https://api.cryptapi.io/btc/logs/?#{query_string}")
  
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  
  request = Net::HTTP::Get.new(uri)
  response = http.request(request)
  data = JSON.parse(response.body)
  
  if data['callbacks'] && !data['callbacks'].empty?
    latest_callback = data['callbacks'][0]
    
    return {
      status: latest_callback['result'],
      confirmations: latest_callback['confirmations'],
      amount: latest_callback['value_coin'],
      txid: latest_callback['txid_in']
    }
  end
  
  { status: 'no_payments', confirmations: 0, amount: 0 }
end

def poll_payment_status(callback_url)
  status = check_payment_status(callback_url)
  
  case status[:status]
  when 'done'
    puts "Payment confirmed and processed!"
    # Update database, notify user, etc.
  when 'pending'
    puts "Payment detected but not confirmed yet"
    # Show pending status to user
  end
end
```

```csharp
using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web;
using Newtonsoft.Json;

public class PaymentStatusChecker
{
    private static readonly HttpClient client = new HttpClient();
    
    public async Task<dynamic> CheckPaymentStatus(string callbackUrl)
    {
        var encodedCallback = HttpUtility.UrlEncode(callbackUrl);
        var queryParams = HttpUtility.ParseQueryString(string.Empty);
        queryParams["callback"] = encodedCallback;
        
        var url = $"https://api.cryptapi.io/btc/logs/?{queryParams}";
        var response = await client.GetAsync(url);
        var result = await response.Content.ReadAsStringAsync();
        var data = JsonConvert.DeserializeObject<dynamic>(result);
        
        if (data.callbacks != null && data.callbacks.Count > 0)
        {
            var latestCallback = data.callbacks[0];
            return new
            {
                status = latestCallback.result,
                confirmations = latestCallback.confirmations,
                amount = latestCallback.value_coin,
                txid = latestCallback.txid_in
            };
        }
        
        return new { status = "no_payments", confirmations = 0, amount = 0 };
    }
    
    public async Task PollPaymentStatus(string callbackUrl)
    {
        var status = await CheckPaymentStatus(callbackUrl);
        
        if (status.status == "done")
        {
            Console.WriteLine("Payment confirmed and processed!");
            // Update database, notify user, etc.
        }
        else if (status.status == "pending")
        {
            Console.WriteLine("Payment detected but not confirmed yet");
            // Show pending status to user
        }
    }
}
```

```java
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import com.google.gson.Gson;
import java.util.Map;

public class PaymentStatusChecker {
    private static final HttpClient client = HttpClient.newHttpClient();
    private static final Gson gson = new Gson();
    
    public Map<String, Object> checkPaymentStatus(String callbackUrl) {
        try {
            String encodedCallback = URLEncoder.encode(callbackUrl, StandardCharsets.UTF_8);
            String url = "https://api.cryptapi.io/btc/logs/" +
                "?callback=" + encodedCallback;
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .GET()
                .build();
            
            HttpResponse<String> response = client.send(request, 
                HttpResponse.BodyHandlers.ofString());
            Map<String, Object> data = gson.fromJson(response.body(), Map.class);
            
            if (data.containsKey("callbacks") && !((java.util.List) data.get("callbacks")).isEmpty()) {
                Map<String, Object> latestCallback = (Map<String, Object>) ((java.util.List) data.get("callbacks")).get(0);
                
                return Map.of(
                    "status", latestCallback.get("result"),
                    "confirmations", latestCallback.get("confirmations"),
                    "amount", latestCallback.get("value_coin"),
                    "txid", latestCallback.get("txid_in")
                );
            }
            
            return Map.of("status", "no_payments", "confirmations", 0, "amount", 0);
        } catch (Exception e) {
            throw new RuntimeException("Payment status check failed", e);
        }
    }
    
    public void pollPaymentStatus(String callbackUrl) {
        Map<String, Object> status = checkPaymentStatus(callbackUrl);
        
        if ("done".equals(status.get("status"))) {
            System.out.println("Payment confirmed and processed!");
            // Update database, notify user, etc.
        } else if ("pending".equals(status.get("status"))) {
            System.out.println("Payment detected but not confirmed yet");
            // Show pending status to user
        }
    }
}
```

```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "net/url"
    "io/ioutil"
)

type PaymentStatus struct {
    Status        string  `json:"status"`
    Confirmations int     `json:"confirmations"`
    Amount        float64 `json:"amount"`
    Txid          string  `json:"txid"`
}

func checkPaymentStatus(callbackURL string) (*PaymentStatus, error) {
    encodedCallback := url.QueryEscape(callbackURL)
    apiURL := fmt.Sprintf("https://api.cryptapi.io/btc/logs/?callback=%s", encodedCallback)
    
    resp, err := http.Get(apiURL)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }
    
    var data map[string]interface{}
    json.Unmarshal(body, &data)
    
    if callbacks, ok := data["callbacks"].([]interface{}); ok && len(callbacks) > 0 {
        latestCallback := callbacks[0].(map[string]interface{})
        
        return &PaymentStatus{
            Status:        latestCallback["result"].(string),
            Confirmations: int(latestCallback["confirmations"].(float64)),
            Amount:        latestCallback["value_coin"].(float64),
            Txid:          latestCallback["txid_in"].(string),
        }, nil
    }
    
    return &PaymentStatus{Status: "no_payments", Confirmations: 0, Amount: 0}, nil
}

func pollPaymentStatus(callbackURL string) {
    status, err := checkPaymentStatus(callbackURL)
    if err != nil {
        fmt.Printf("Error checking payment status: %v\n", err)
        return
    }
    
    switch status.Status {
    case "done":
        fmt.Println("Payment confirmed and processed!")
        // Update database, notify user, etc.
    case "pending":
        fmt.Println("Payment detected but not confirmed yet")
        // Show pending status to user
    }
}
```

```bash
# Check payment status using logs endpoint
CALLBACK_URL=$(echo "https://yoursite.com/webhook?order_id=12345" | jq -rR @uri)

curl -G "https://api.cryptapi.io/btc/logs/" \
  --data-urlencode "callback=${CALLBACK_URL}" \
  | jq '.callbacks[0] | {status: .result, confirmations: .confirmations, amount: .value_coin, txid: .txid_in}'

# Use in a cron job script
#!/bin/bash
check_payment_status() {
    local callback_url="$1"
    local encoded_callback=$(echo "$callback_url" | jq -rR @uri)
    
    curl -s -G "https://api.cryptapi.io/btc/logs/" \
      --data-urlencode "callback=${encoded_callback}" \
      | jq -r '.callbacks[0].result // "no_payments"'
}

# Poll payment status
status=$(check_payment_status "https://yoursite.com/webhook?order_id=12345")
if [ "$status" = "done" ]; then
    echo "Payment confirmed and processed!"
elif [ "$status" = "pending" ]; then
    echo "Payment detected but not confirmed yet"
fi
```

### API Reference

- **[GET /{ticker}/logs/](../api/tickerlogs)** - Check payment address logs and webhook history

### Important Implementation Notes

**API Status vs Payment Status:**
- **`status`** field indicates API request success (`success`/`error`)
- **Payment status** is found within the `callbacks` array and `logs` entries

**Multiple Transactions:**
- Each payment address can receive multiple transactions
- Each transaction has a unique `uuid` (or use `txid_in` + `value_coin` as fallback)
- **Always store the UUID** in your database to prevent duplicate processing

**Confirmation Detection:**
- Check `logs` array within each callback
- Transaction is confirmed when `pending = 0` in any log entry
- Don't rely solely on `result` field - check the logs for confirmation status

**Duplicate Prevention:**
- Store transaction UUIDs in your database
- Check if UUID exists before processing any transaction
- This prevents processing the same transaction multiple times

### Payment Status Values

The logs endpoint returns different `result` values indicating payment status:

- **`pending`** - Transaction is being confirmed by the blockchain
- **`sent`** - Payment forwarded to your address but webhook didn't receive valid `*ok*` response
- **`done`** - Payment forwarded and webhook sent to your URL with valid `*ok*` response received

### When to Use Each Method

**Use Webhooks when:**
- You need real-time payment notifications
- Your application can receive HTTP requests
- You want the most efficient solution

**Use Logs Endpoint when:**
- Webhooks aren't feasible (firewall restrictions, etc.)
- You need to troubleshoot webhook issues
- Implementing backup payment monitoring
- Running periodic cron jobs to check payment status

> **INFO**
>**Pro Tip:** Use webhooks as your primary method and logs endpoint as a backup. This ensures you never miss a payment even if webhook delivery fails.


## Testing Your Integration

Test your payment flow using real cryptocurrency with minimal cost:

### 1. Use Litecoin for Testing
We recommend using **Litecoin (LTC)** for testing because:
- Low transaction fees (typically under $0.01)
- Fast confirmation times (2.5 minutes average)
- Low CryptAPI fees on small amounts
- Real blockchain testing without high costs

Simply change your ticker from `btc` to `ltc` in your existing code. **If your integration works with LTC, it will work with any ticker** (`btc`, `eth`, `trc20/usdt`, `bep20/usdc`, etc.) - the API endpoints and webhook structure are identical across all cryptocurrencies.

> **TIP**
>**Multiple Payment Options:** Since the API is universal across all cryptocurrencies, you can easily offer your customers multiple payment options. Just let them choose their preferred cryptocurrency and use the corresponding ticker in your API calls. The same code handles Bitcoin, Ethereum, USDT (eg `trc20/usdt`), and any other supported cryptocurrency.
> 
> Check the full list of supported cryptocurrencies at [cryptapi.io/cryptocurrencies](https://cryptapi.io/cryptocurrencies).


### 2. Test with $2 Worth of LTC
- Send approximately **$2 USD worth of Litecoin** to test the complete flow
- This covers blockchain fees + CryptAPI fees with minimal cost
- You can buy small amounts of LTC on most exchanges
- Test both pending and confirmed webhook states

### 3. Test Checklist
- ✅ Payment creation works with LTC
- ✅ QR code displays correctly
- ✅ Address copying functions
- ✅ Pending webhook received (fast with LTC)
- ✅ Confirmed webhook received
- ✅ UI updates correctly
- ✅ Amount calculations are accurate
- ✅ Success flow completes

### 4. Testing Environment Setup
```bash
# Use ngrok for local webhook testing
ngrok http 3000

# Your test webhook URL: https://abc123.ngrok.io/webhook
```

> **TIP**
>**Why Litecoin?** With $2 worth of LTC, total fees (blockchain + CryptAPI) are typically under $0.10, making it the most cost-effective way to test real payment flows. Once testing is complete, switch to your preferred cryptocurrency for production.


> **SUCCESS**
>**Ready for production?** Once testing is complete, update your ticker from `ltc` to your preferred cryptocurrency (e.g., `btc`, `eth`, `trc20/usdt`) and update your destination addresses.

