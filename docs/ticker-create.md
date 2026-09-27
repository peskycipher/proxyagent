# Create New Payment Address

This method is used to generate a new address to give your clients, where they can send payments.

**Notices:** 
* The length of this request should not exceed `8192` characters.
* **Please keep in mind** that before making any transaction, you should check the minimum transfer limit for the specific [cryptocurrency or token](https://cryptapi.io/cryptocurrencies/) you want to use. If you transfer an amount that's less than the minimum limit set by CryptAPI, your transaction will be rejected.

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/{ticker}/create/
```

## Parameters

### Path Parameters

- **`ticker`** (`string`) (required) - Example: `btc`: The `ticker` parameter in this API request refers to the unique identifier of the cryptocurrency to which you are making the request. It is included in the URL of the request and helps to specify the exact cryptocurrency that you want to retrieve data for. The ticker is typically a short code that uniquely identifies the cryptocurrency, or the token and it's network/blockchain.

For example, `btc` is the ticker for Bitcoin, and `trc20/usdt` is the ticker for USDT over TRC-20. Having this in mind, a request for USDT over TRC-20 will look like this: `https://api.cryptapi.io/trc20/usdt/create/`.

**Notes:**
* You can find all our tickers in our [cryptocurrencies](https://cryptapi.io/cryptocurrencies) page.

### Query Parameters

- **`callback`** (`string`) (required) - Example: `https://example.com/your_callback?invoice_id=123&nonce=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`: The URL where the callbacks/webhooks will be sent to. Must be a valid URL.

**Notes:**
* The callback URL should be unique. The same callback URL will return the same `address_in`, meaning it works similarly to an ID. You can make your callback URL unique by adding `GET` parameters, like: `?user_id=1234`. These will also be returned in the [callbacks](#tag/Callbacks), as a `GET` parameter, even if you set the webhook to `post` or `json`.
* You may reuse callback URLs if for example you wish to create a deposit `address_in`. Note though that, once an `address_in` is created, if for any reason you wish to change the `address`, CryptAPI systems will not change the `address_out`, meaning you will need to change your callback URL to generate a new `address_in`.
* We advise you to URL Encode the callback URL, otherwise the `GET` parameters you add may be lost.
* `GET` parameters you add to the callback URL will be sent as `GET`, even if you enable the `post` parameter.
* It's advised to store the `callback` URL when making creating a new payment address if you wish to use the [logs](/tickerlogs) endpoint later.
* **Harden your callback with a secret.** Add an unguessable value unique to each request (for example `?nonce=a1b2c3...`) and store it on your side. CryptAPI returns it unchanged in every callback, so verify it in your webhook and reject any callback whose value you don't recognize. Use this together with [webhook signature verification](/webhooks/verify-webhook-signature).
* For the complete documentation on callbacks, please refer to our [webhook documentation](/webhooks/custom-payment-flow-webhooks).

- **`address`** (`string`) - Example: `1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP`: The `address` parameter is where you specify where CryptAPI will forward your payment. You can enter a single address or multiple addresses if you want to split the payment to multiple addresses.

If you're using multiple addresses, you will need to format them like this: `percentage_1@address_1|percentage_2@address_2` and so on (you may add up to `20` addresses to split the payment). Percentages can range from 0.0001 (0.01%) to 1.0 (100%) and must add up to 1.00 (100%).

Addresses **must be valid** for the `ticker` you're using, otherwise the API will reject the payment. For example, if you try using a Bitcoin address while requesting a USDT TRC-20 address, **API will throw an error**.

**Notes:**
* For multiple addresses, the minimum value per transaction (**[see cryptocurrencies page](https://cryptapi.io/cryptocurrencies/)**) is multiplied by the following formula: `1 + (N - 1) / 3`, where **N** is the number of output addresses.
* For more information about **multi-address minimums**, check our [knowledge base](https://support.cryptapi.io/article/multi-address-minimums).

- **`pending`** (`integer`) - Example: `1`: Set to `pending=1` to enable. If enabled you will be notified of pending transactions (transactions that were sent by the customer, but yet to be confirmed by the blockchain).

**Notes:**
* To prevent repeated callbacks to your systems, the response to the callback request should be `*ok*` in plain text.
* For a complete list of fields sent by our system, please refer to our [webhook documentation](/webhooks/custom-payment-flow-webhooks).

- **`confirmations`** (`integer`) - Example: `3`: Number of blockchain confirmations you want before receiving the confirmed webhook. For more information please check our [webhook documentation](/webhooks/custom-payment-flow-webhooks).

Min: `1`

- **`post`** (`integer`) - Example: `1`: Set this to `post=1` to enable. If enabled callback will be sent as `POST`.

If disabled, will default to `GET`.

**Notes**:
* `GET` parameters you added to the `callback` URL will still be sent as `GET`.
* Not compatible with the `json` parameter.

- **`json`** (`integer`) - Example: `1`: Set this to `json=1` to enable. If enabled the callback body will be sent as `JSON`.

If disabled, will default to `GET`.

**Notes**:
* `GET` parameters you added to the `callback` URL will still be sent as `GET`.
* Not compatible with the `post` parameter.

- **`priority`** (`string`) - Example: `default`: Allows you to set the priority with which funds should be forwarded to the provided `address`. It reflects the amount of fees paid to the blockchain network and can affect the speed of transaction confirmation.

**Notes:**
* Only supported when using Bitcoin, Ethereum/ERC-20 and Litecoin. Priorities are different per each supported blockchain.
* You can find the priorities to use with this endpoint, per blockchain, in our [knowledge base](https://support.cryptapi.io/article/how-the-priority-parameter-works).

- **`multi_token`** (`integer`) - Example: `1`: Allows customers to pay with any token supported by CryptAPI API, even if the token is different from what the user initially specified.

However, you should ensure that your Wallet supports the tokens you expect customers to pay with and that your system can handle price conversions. For example, if a customer wishes to receive 1000 USDT (or equivalent) and a client sends 1000 TRX, the system should be able to handle that scenario.

**Notes:**
* Make sure the wallet you're using supports all the tokens supported by CryptAPI before enabling this parameter.
* **If you are using your favorite exchange's deposit address to receive the funds, it's advised to leave this parameter disabled**, since sometimes the deposit addresses may differ between blockchains and tokens.
* Disabled by default, use `multi_token=1` to enable it.
* Available only for TRC20 and all supported EVM-based blockchains (eg. ERC20, BEP20, POLYGON).
* If disabled and the customer send a different token from the initially specified, CryptAPI API will ignore these funds.
* If enabled on unsupported blockchains, **API won't throw an error**. Instead it just ignores it.
* For more information about this parameter, check our [knowledge base](https://support.cryptapi.io/article/how-the-multi_token-parameter-works).

- **`convert`** (`integer`) - Example: `1`: If enabled, returns the converted value converted to FIAT in the callback, with the parameters `value_coin_convert` and `value_forwared_coin_convert`.

**Notes:**
* Disabled by default, use `convert=1` to enable it.
* The value of the fields are json-encoded.

---

## Returns

Returns the newly created payment address details.

- **`address_in`** (`string`): Address generated by our API. You must provide it to your customer in order to receive payments.

- **`address_out`** (`string`): Your address(es), where the payment will be forwarded to, should be the same address(es) you provided.

- **`callback_url`** (`string`): The callback URL you provided.

- **`priority`** (`string`): The confirmation priority you requested.

- **`minimum_transaction_coin`** (`number`): The minimum transaction value coin. All the minimums can be found at our [cryptocurrencies page](https://cryptapi.io/cryptocurrencies).

- **`status`** (`string`): Status of the request. Should be `success` if the request didn't fail.



## Example Response

```json
{
  "address_in": "14PqCsA7KMgseZMPwg6mJy754MtQkrgszu",
  "address_out": "1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP (single address)\n\n{1H6ZZpRmMnrw8ytepV3BYwMjYYnEkWDqVP: 0.70, 1PE5U4temq1rFzseHHGE2L8smwHCyRbkx3: 0.30} (multiple addresses)\n",
  "callback_url": "https://example.com/invoice/1234?payment_id=5678",
  "priority": "default",
  "minimum_transaction_coin": 0.008,
  "status": "success"
}
```