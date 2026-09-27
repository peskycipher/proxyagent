# Check Payment Address Logs

This method provides information and callbacks for addresses created through the `create` endpoint.

It returns a list of callbacks made at the specified `callbacks` parameter, and allows to track payment activity and troubleshoot any issues.

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/{ticker}/logs/
```

---

## Parameters

### Path Parameters

- **`ticker`** (`string`) (required): The `ticker` parameter in this API request refers to the unique identifier of the cryptocurrency to which you are making the request.

It is included in the URL of the request and helps to specify the exact cryptocurrency that you want to retrieve data for. The ticker is typically a short code that uniquely identifies the cryptocurrency, or the token and it's network/blockchain.

For example, `btc` is the ticker for Bitcoin, and `trc20/usdt` is the ticker for USDT over TRC-20. Having this in mind, a request for USDT over TRC-20 will look like this: `https://api.cryptapi.io/trc20/usdt/create/`.

**Notes:**
* You can find all our tickers in our [cryptocurrencies](https://cryptapi.io/cryptocurrencies) page.

---

### Query Parameters

- **`callback`** (`string`) (required): The URL of the callback. Must be the same URL provided when the payment was created.

**Notes:**
* It's advised to store the `callback` URL when creating a new payment address if you wish to use this endpoint later.
* We advise URL Encoding the `callback` when making the request. If using one of our libraries there's no need for it.

---

## Returns

Returns a list of callbacks for the specified address. Returns an error if the address is not found or if there are no callbacks.

- **`address_in`** (`string`): Generated address for the callback URL provided.

- **`address_out`** (`string`): Your address(es), where the payment will be forwarded to, should be the same address(es) you provided.

**Notes:**
- Response will be `{1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP: 0.70, 1PE5U4temq1rFzseHHGE2L8smwHCyRbkx3: 0.30}` (multiple addresses)

- **`callback_url`** (`string`): The callback URL you provided.

- **`status`** (`string`): Status of the request. Should be `success` if the request didn't fail.

- **`notify_pending`** (`boolean`): Shows if you enabled the pending callback when creating the address.

- **`notify_confirmations`** (`integer`): Number of confirmations required before sending the confirmed callback.

- **`priority`** (`string`): The confirmation priority you requested.

- **`callbacks`** (`Array of objects`): List of payments made to this address, together with the logs of the callbacks to your system.

  - **`txid_in`** (`string`): Hash of the transaction received from the client.

  - **`txid_out`** (`string`): Hash of the transaction of the payment to you.

  - **`value_coin`** (`number`): Value sent by your customer to the created address.

  - **`value_forwarded_coin`** (`number`): Value forwarded to your wallet address, after fees.

  - **`confirmations`** (`integer`): Number of blockchain confirmations of the current transaction.

  - **`last_update`** (`string`): Time and date when this callback was last updated (UTC-0).

  - **`result`** (`string`): Result status of this callback. It can be one of the following options:
- `pending` (transaction is being confirmed by the blockchain)
- `sent` (payment forwarded to your address but webhook didn't receive valid `*ok*` response)
- `done` (payment forwarded and webhook sent to your URL with valid `*ok*` response received)

  - **`fee_percent`** (`number`): Percentage of the fee charged by BlockBee.

  - **`fee_coin`** (`number`): Value of BlockBee Fee deducted from `value_coin`.

  - **`logs`** (`Array of objects`): Last 10 requests to your server, ordered by timestamp descending.

  - **`request_url`** (`string`): URL that BlockBee API tried to call with the GET parameters included.

**Notes:**
- If was set to POST while creating the address the only GET parameters provided in the URL, will be the ones provided by you in the `callback` parameter, while the BlockBee parameters will be in POST.

  - **`responses`** (`string`): Response given by your systems to our callback.

  - **`response_status`** (`string`): HTTP Status code provided by your system to our callback.

  - **`next_try`** (`string`): Datetime in UTC-0 when callback will be retried (if not `done`).

  - **`pending`** (`integer`): Will be `1` if it is the pending callback.

  - **`confirmed`** (`integer`): Will be `1` if it is the confirmed callback



## Example Response

```json
{
  "address_in": "14PqCsA7KMgseZMPwg6mJy754MtQkrgszu",
  "address_out": "1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP",
  "callback_url": "https://example.com/invoice/1234?payment_id=5678",
  "status": "success",
  "notify_pending": true,
  "notify_confirmations": 1,
  "priority": "default",
  "callbacks": [
    {
      "txid_in": "33f11611f863d7475eb10daada2f225f0877561cf58cdfff175e99635dfd9120",
      "txid_out": "5ea53d5e728bfdb56b54c0b945990b69ae1e66cec56ab24679c9a622c4695276",
      "value_coin": 0.1,
      "value_forwarded_coin": 0.1,
      "confirmations": 13,
      "last_update": "15/02/2018 21:23:42",
      "result": "done",
      "fee_percent": 1,
      "fee_coin": 0.02,
      "logs": [
        {
          "request_url": "https://example.com/callback.php?order_id=423&nonce=KRnrAtVbbPrA21TR4yQDESnTV5xxV4jR&uuid=883d30bc-d53b-46e4-9f4d-425001a6a45d&address_in=0x672FF17DDD6f2F6b1CA8c2A9cC8D25f0950AbCc5&address_out=0xA6B78B56ee062185E405a1DDDD18cE8fcBC4395d&confirmations=84484&txid_in=0x4ac6d4f5df0803f91d5fb34d566400bb4417e98d5a515be087a9447d1f22cbbc&txid_out=0x711e26fec256b9945cee5195636772266104adc293d9013caa27752433a7effd&fee=1&value=200&value_coin=2.00011&value_forwarded=184&value_forwarded_coin=1.844926267290333679&coin=bep20_usdt&result=sent&pending=0",
          "responses": "*ok*",
          "response_status": "200",
          "next_try": "14/10/2022 12:47:18",
          "pending": "0",
          "confirmed": 1
        }
      ]
    }
  ]
}
```