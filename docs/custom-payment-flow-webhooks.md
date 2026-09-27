# Custom Payment Flow Webhooks

Real-time webhook notifications sent when payments are received via custom payment flow. CryptAPI sends two types of webhooks: **pending** (payment detected in mempool) and **confirmed** (payment verified by blockchain).

**Method:** You choose when creating the payment:
- `GET` (default) - Webhook data sent as URL query parameters
- `POST` (set `post=1`) - Webhook data sent in request body

**Content-Type:** You choose when creating the payment:
- `application/x-www-form-urlencoded` (default) - Standard form encoding
- `application/json` (set `json=1`) - JSON format in request body

> **INFO: Custom parameters location**
>Custom parameters you append to the webhook URL passed in the `callback` parameter (e.g., `order_id`, `user_id`) are delivered as URL query parameters. They are available via the request's query string even when you set `post=1` and/or `json=1`.


---

## Tracking Payments with Custom Parameters

> **INFO: Important: Add Custom Parameters to Your Webhook URL**
>When creating custom payment flow payments, always add your own query parameters to the webhook URL you pass in the `callback` parameter to track which order or user the payment belongs to. For example, adding `?order_id=123` or `?user_id=456` will ensure that these parameters are included in the webhook payload.
> 
> This is the recommended way to link a CryptAPI payment to a specific order or user in your system.


---

## Webhook Types

### Pending Webhook
Sent when a payment is detected in the blockchain mempool but not yet confirmed. Particularly useful for slower blockchains (Bitcoin, Litecoin, Bitcoin Cash) to provide immediate user feedback.

### Confirmed Webhook  
Sent when a payment receives the specified number of confirmations. The transaction is considered final and funds are forwarded to your address.

---

## Webhook Fields

### Common Fields (Both Pending & Confirmed)

These fields are included in both pending and confirmed webhooks:

- **`uuid`** (`string`) (required): Unique identifier for each payment transaction. Use this to prevent processing duplicate webhooks.

**Important:** Always store and check this UUID in your database before processing any payment to avoid duplicates.

- **`address_in`** (`string`) (required): CryptAPI-generated payment address where your customer sent the payment.

- **`address_out`** (`string`) (required): Your destination address(es) where CryptAPI forwards the payment.

**Format:**
- Single address: `1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP`
- Multiple addresses: `{1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP: 0.70, 1PE5U4temq1rFzseHHGE2L8smwHCyRbkx3: 0.30}`

- **`txid_in`** (`string`) (required): Transaction hash of your customer's payment on the blockchain.

- **`coin`** (`string`) (required): Cryptocurrency ticker used for the payment.

**Format:**
- Native coins: `btc`, `eth`, `ltc`, `bch`, `trx`
- ERC-20 tokens: `erc20_usdt`, `erc20_usdc`
- TRC-20 tokens: `trc20_usdt`, `trc20_usdc`
- BEP-20 tokens: `bep20_usdt`, `bep20_usdc`
- Polygon tokens: `polygon_usdt`, `polygon_usdc`

- **`price`** (`number`) (required): Cryptocurrency price in USD at the time the webhook was sent.

- **`pending`** (`integer`) (required): Indicates webhook type:
- `1` = Pending webhook (payment detected, not confirmed)
- `0` = Confirmed webhook (payment verified and forwarded)

### Confirmed Webhook Only Fields

These additional fields are only included in confirmed webhooks (`pending=0`):

- **`txid_out`** (`string`) (required): Transaction hash of CryptAPI's forwarding transaction to your address(es).

- **`confirmations`** (`integer`) (required): Number of blockchain confirmations the transaction has received.

- **`value_coin`** (`number`) (required): Payment amount sent by your customer before any fees are deducted.

**Note:** For the amount after fees, use `value_forwarded_coin`

- **`value_coin_convert`** (`string`): JSON-encoded object with FIAT currency conversions of `value_coin`.

**Availability:** Only when `convert=1` was set during payment creation

**Format:** `{"USD": "3.20", "EUR": "3.05", "GBP": "2.62", "CAD": "4.16", ...}`

- **`value_forwarded_coin`** (`number`) (required): Amount forwarded to your address after CryptAPI fees are deducted.

- **`value_forwarded_coin_convert`** (`string`): JSON-encoded object with FIAT currency conversions of `value_forwarded_coin`.

**Note:** Only present when `convert=1` was set during payment creation

**Format:** `{"USD": "3.17", "EUR": "3.01", "GBP": "2.59", "CAD": "4.12", ...}`

- **`fee_coin`** (`number`) (required): CryptAPI service fee deducted from the `value_coin` amount.

---

## Security: Verify Webhook Signatures

> **WARNING**
>**Security Warning!** Always verify incoming webhook signatures. For a complete guide, see our **[Verify Webhook Signatures Guide](/webhooks/verify-webhook-signature)**.


---

## Reliability and Best Practices

For important information on how CryptAPI handles webhook delivery, retries, and timeouts, along with essential best practices for building a reliable webhook handler, please see our main guide.

**➡️ [Read the How Webhooks Work Guide](/webhooks/)**

---

## Implementation Examples

```javascript
// Express.js webhook handler (supports both GET and POST)
app.all('/webhook', express.json(), (req, res) => {
  // 1. Verify the webhook signature
  if (!verifyWebhookSignature(req)) {
    return res.status(401).send('Unauthorized');
  }

  // 2. Extract data
  // Body fields (depending on post=1/json=1)
  const source = req.method === 'GET' ? req.query : req.body;
  const { uuid, pending, value_coin, coin } = source;
  // Custom parameters are ALWAYS sent as query parameters
  const { order_id, user_id } = req.query;
  
  // 3. Check for duplicates using UUID
  if (isWebhookAlreadyProcessed(uuid)) {
    return res.status(200).send('*ok*');
  }
  
  // 4. Handle based on webhook type
  if (pending === 1) {
    // Handle pending payment
    notifyUser(user_id, 'Payment detected, awaiting confirmation...');
  } else if (pending === 0) {
    // Handle confirmed payment  
    processSuccessfulPayment({
      uuid,
      value_coin,
      coin,
      orderId: order_id,
      userId: user_id
    });
  }
  
  // 5. Mark this webhook as processed using the UUID
  markWebhookAsProcessed(uuid);
  
  // Always respond to stop retries
  res.status(200).send('*ok*');
});
```

```php
<?php
// webhook.php

// 1. Verify the webhook signature
if (!verifyWebhookSignature()) {
    http_response_code(401);
    exit('Unauthorized');
}

// 2. Extract data from the payload
$data = json_decode(file_get_contents('php://input'), true) ?: [];

$uuid = $data['uuid'] ?? null;
$pending = $data['pending'] ?? null;
$value_coin = $data['value_coin'] ?? null;
$coin = $data['coin'] ?? null;
// Custom parameters are ALWAYS sent as query parameters (appended to the URL you pass via the `callback` parameter)
$order_id = $_GET['order_id'] ?? ($data['order_id'] ?? null);
$user_id = $_GET['user_id'] ?? ($data['user_id'] ?? null);

// 3. Use the uuid to prevent processing the same webhook twice
if (isWebhookAlreadyProcessed($uuid)) {
    http_response_code(200);
    echo '*ok*';
    exit;
}

// 4. Handle based on webhook type
if ($pending == 1) {
    // Handle pending payment
    notifyUser($user_id, 'Payment detected, awaiting confirmation...');
} else if ($pending == 0) {
    // Handle confirmed payment
    processSuccessfulPayment([
        'uuid' => $uuid,
        'value_coin' => $value_coin,
        'coin' => $coin,
        'orderId' => $order_id,
        'userId' => $user_id
    ]);
}

// 5. Mark this webhook as processed using the UUID
markWebhookAsProcessed($uuid);

// Always respond to stop retries
http_response_code(200);
echo '*ok*';
?>
```

```python
# Flask webhook handler
@app.route('/webhook', methods=['POST'])
def webhook():
    # 1. Verify the webhook signature
    if not verify_webhook_signature(request):
        return 'Unauthorized', 401

    # 2. Extract data from the payload
    data = request.get_json(silent=True) or {}

    uuid = data.get('uuid')
    pending = data.get('pending')
    value_coin = data.get('value_coin')
    coin = data.get('coin')
    # Custom parameters are ALWAYS sent as query parameters
    order_id = request.args.get('order_id') or data.get('order_id')
    user_id = request.args.get('user_id') or data.get('user_id')

    # 3. Use the uuid to prevent processing the same webhook twice
    if is_webhook_already_processed(uuid):
        return '*ok*', 200

    # 4. Handle based on webhook type
    if pending == 1:
        # Handle pending payment
        notify_user(user_id, 'Payment detected, awaiting confirmation...')
    elif pending == 0:
        # Handle confirmed payment
        process_successful_payment({
            'uuid': uuid,
            'value_coin': value_coin,
            'coin': coin,
            'order_id': order_id,
            'user_id': user_id
        })

    # 5. Mark this webhook as processed using the UUID
    mark_webhook_as_processed(uuid)

    # Always respond to stop retries
    return '*ok*', 200
```

```ruby
# Ruby on Rails webhook handler
class WebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token

  def payment
    # 1. Verify the webhook signature
    unless verify_webhook_signature(request)
      render plain: 'Unauthorized', status: :unauthorized
      return
    end

    # 2. Extract data from the payload
    uuid = params[:uuid]
    pending = params[:pending]
    value_coin = params[:value_coin]
    coin = params[:coin]
    # Custom parameters are ALWAYS sent as query parameters
    order_id = request.query_parameters[:order_id] || params[:order_id]
    user_id = request.query_parameters[:user_id] || params[:user_id]

    # 3. Use the uuid to prevent processing the same webhook twice
    if webhook_already_processed?(uuid)
      render plain: '*ok*', status: :ok
      return
    end

    # 4. Handle based on webhook type
    if pending == 1
      # Handle pending payment
      notify_user(user_id, 'Payment detected, awaiting confirmation...')
    elsif pending == 0
      # Handle confirmed payment
      process_successful_payment(
        uuid: uuid,
        value_coin: value_coin,
        coin: coin,
        order_id: order_id,
        user_id: user_id
      )
    end

    # 5. Mark this webhook as processed using the UUID
    mark_webhook_as_processed(uuid)

    # Always respond to stop retries
    render plain: '*ok*', status: :ok
  end
end
```

```csharp
// ASP.NET Core webhook handler
[ApiController]
[Route("webhook")]
public class WebhookController : ControllerBase
{
    [HttpPost("payment")]
    public async Task<IActionResult> PaymentWebhook([FromBody] CustomPaymentWebhookPayload payload)
    {
        // 1. Verify the webhook signature
        if (!VerifyWebhookSignature(Request))
        {
            return Unauthorized("Unauthorized");
        }

        // 2. Extract data from the payload
        var uuid = payload.Uuid;
        var pending = payload.Pending;
        var valueCoin = payload.ValueCoin;
        var coin = payload.Coin;
        // Custom parameters are ALWAYS sent as query parameters
        var orderId = Request.Query["order_id"].FirstOrDefault() ?? payload.OrderId;
        var userId = Request.Query["user_id"].FirstOrDefault() ?? payload.UserId;

        // 3. Use the uuid to prevent processing the same webhook twice
        if (IsWebhookAlreadyProcessed(uuid))
        {
            return Ok("*ok*");
        }

        // 4. Handle based on webhook type
        if (pending == 1)
        {
            // Handle pending payment
            await NotifyUser(userId, "Payment detected, awaiting confirmation...");
        }
        else if (pending == 0)
        {
            // Handle confirmed payment
            await ProcessSuccessfulPayment(new PaymentData
            {
                Uuid = uuid,
                ValueCoin = valueCoin,
                Coin = coin,
                OrderId = orderId,
                UserId = userId
            });
        }

        // 5. Mark this webhook as processed using the UUID
        MarkWebhookAsProcessed(uuid);

        // Always respond to stop retries
        return Ok("*ok*");
    }
}

public class CustomPaymentWebhookPayload
{
    [JsonProperty("uuid")]
    public string Uuid { get; set; }

    [JsonProperty("pending")]
    public int Pending { get; set; }

    [JsonProperty("value_coin")]
    public decimal ValueCoin { get; set; }

    [JsonProperty("coin")]
    public string Coin { get; set; }

    [JsonProperty("order_id")]
    public string OrderId { get; set; }

    [JsonProperty("user_id")]
    public string UserId { get; set; }
}
```

```java
// Spring Boot webhook handler
@RestController
@RequestMapping("/webhook")
public class WebhookController {

    @PostMapping("/payment")
    public ResponseEntity<String> paymentWebhook(@RequestBody CustomPaymentWebhookPayload payload) {
        // 1. Verify the webhook signature
        if (!verifyWebhookSignature(request)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }

        // 2. Extract data from the payload
        String uuid = payload.getUuid();
        Integer pending = payload.getPending();
        BigDecimal valueCoin = payload.getValueCoin();
        String coin = payload.getCoin();
        // Custom parameters are ALWAYS sent as query parameters (e.g., request.getParameter("order_id"))
        String orderId = payload.getOrderId();
        String userId = payload.getUserId();

        // 3. Use the uuid to prevent processing the same webhook twice
        if (isWebhookAlreadyProcessed(uuid)) {
            return ResponseEntity.ok("*ok*");
        }

        // 4. Handle based on webhook type
        if (pending == 1) {
            // Handle pending payment
            notifyUser(userId, "Payment detected, awaiting confirmation...");
        } else if (pending == 0) {
            // Handle confirmed payment
            processSuccessfulPayment(new PaymentData(uuid, valueCoin, coin, orderId, userId));
        }

        // 5. Mark this webhook as processed using the UUID
        markWebhookAsProcessed(uuid);

        // Always respond to stop retries
        return ResponseEntity.ok("*ok*");
    }
}

public class CustomPaymentWebhookPayload {
    private String uuid;
    private Integer pending;
    private BigDecimal valueCoin;
    private String coin;
    private String orderId;
    private String userId;

    // Getters and setters
    public String getUuid() { return uuid; }
    public void setUuid(String uuid) { this.uuid = uuid; }
    public Integer getPending() { return pending; }
    public void setPending(Integer pending) { this.pending = pending; }
    public BigDecimal getValueCoin() { return valueCoin; }
    public void setValueCoin(BigDecimal valueCoin) { this.valueCoin = valueCoin; }
    public String getCoin() { return coin; }
    public void setCoin(String coin) { this.coin = coin; }
    public String getOrderId() { return orderId; }
    public void setOrderId(String orderId) { this.orderId = orderId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
}
```

```go
// Go webhook handler
package main

import (
    "encoding/json"
    "log"
    "net/http"
)

type CustomPaymentWebhookPayload struct {
    Uuid      string  `json:"uuid"`
    Pending   int     `json:"pending"`
    ValueCoin float64 `json:"value_coin"`
    Coin      string  `json:"coin"`
    OrderID   string  `json:"order_id"`
    UserID    string  `json:"user_id"`
}

func paymentWebhookHandler(w http.ResponseWriter, r *http.Request) {
    // 1. Verify the webhook signature
    if !verifyWebhookSignature(r) {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // 2. Extract data from the payload
    var payload CustomPaymentWebhookPayload
    if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    // 3. Use the uuid to prevent processing the same webhook twice
    if isWebhookAlreadyProcessed(payload.Uuid) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("*ok*"))
        return
    }

    // 4. Handle based on webhook type
    if payload.Pending == 1 {
        // Handle pending payment
        notifyUser(payload.UserID, "Payment detected, awaiting confirmation...")
    } else if payload.Pending == 0 {
        // Handle confirmed payment
        processSuccessfulPayment(PaymentData{
            Uuid:      payload.Uuid,
            ValueCoin: payload.ValueCoin,
            Coin:      payload.Coin,
            OrderID:   payload.OrderID,
            UserID:    payload.UserID,
        })
    }

    // 5. Mark this webhook as processed using the UUID
    markWebhookAsProcessed(payload.Uuid)

    // Always respond to stop retries
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("*ok*"))
}

type PaymentData struct {
    Uuid      string
    ValueCoin float64
    Coin      string
    OrderID   string
    UserID    string
}
```

```bash
# Test webhook with curl (for development/testing)

# Test pending webhook
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "dbfcb40e-5a6b-4305-9fa2-b0fbda6e3ff2",
    "pending": 1,
    "value_coin": 0.05,
    "coin": "btc",
    "order_id": "12345",
    "user_id": "67890"
  }'

# Test confirmed webhook
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "dbfcb40e-5a6b-4305-9fa2-b0fbda6e3ff2",
    "pending": 0,
    "value_coin": 0.05,
    "coin": "btc",
    "order_id": "12345",
    "user_id": "67890",
    "confirmations": 3,
    "value_forwarded_coin": 0.0495
  }'

# Expected response: *ok*
```


## Webhook Payload Example

```json
{
  "uuid": "dbfcb40e-5a6b-4305-9fa2-b0fbda6e3ff2",
  "address_in": "3PFoGK63cVVUWnd2vu7W1kM83NXUfvzMqM",
  "address_out": "1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP",
  "txid_in": "a2174ffd39289100709f2a07b129cdbba69df2e22e5be1830221dab1fd4e332c",
  "txid_out": "b3285ggd50390211820g3b18b240decbba70eg3f33f6cf2941332eab2ge5f443d",
  "confirmations": 3,
  "value_coin": 0.05,
  "value_coin_convert": "{\"USD\": \"3.20\", \"EUR\": \"3.05\", \"GBP\": \"2.62\", \"CAD\": \"4.16\"}",
  "value_forwarded_coin": 0.0495,
  "value_forwarded_coin_convert": "{\"USD\": \"3.17\", \"EUR\": \"3.01\", \"GBP\": \"2.59\", \"CAD\": \"4.12\"}",
  "fee_coin": 0.0005,
  "coin": "btc",
  "price": 64000,
  "pending": 0
}
```