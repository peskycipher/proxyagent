# Payment QR Code Generator

This method generates a base64-encoded QR Code image for payments.

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/{ticker}/qrcode/
```

---

## Parameters

### Path Parameters

- **`ticker`** (`string`) (required): The `ticker` parameter in this API request refers to the unique identifier of the cryptocurrency to which you are making the request.

It is included in the URL of the request and helps to specify the exact cryptocurrency that you want to retrieve data for. The ticker is typically a short code that uniquely identifies the cryptocurrency, or the token and it's network/blockchain.

For example, `btc` is the ticker for Bitcoin, and `trc20/usdt` is the ticker for USDT over TRC-20. Having this in mind, a request for USDT over TRC-20 will look like this: `https://api.cryptapi.io/trc20/usdt/create/`.

**Notes:**
* You can find all our tickers in our [cryptocurrencies](https://cryptapi.io/cryptocurrencies) page.

### Query Parameters

- **`address`** (`string`) (required): The payment address (`address_in` from our system).

- **`value`** (`integer`): Value to request the user. Optional.

**Notes:**
* If left empty the QR Code will only contain the address.
* It is important to mention that the `value` parameter might not be compatible with many exchanges and wallets. While it works with Trust and Exodus wallets, some user wallets or exchanges may only read the address and ignore the value field (inserting both the address and the value in the address field). Hence, **it is advised to use the value field cautiously and be aware that it may not be recognized by all wallets and exchanges, causing some confusion to the customer**.

- **`size`** (`integer`): Size of the QR Code image in pixels.

Min: `64`
Max: `1024`

---

## Returns

Returns the base64-encoded QR Code image, and the payment URI.

- **`status`** (`string`): Status of the request. Should be success if the request didn't fail.

- **`qr_code`** (`string`): Base64-encoded image of the QR Code.

Here is an example of how to use this:
```html
<img src="data:image/png;base64,{qr_code}" alt="Payment QR Code"/>
```
You may use it in every situation where is supported, just don't forget to add `data:image/png;base64,` before the qr_code.

- **`payment_uri`** (`string`): Payment URI useful if you want to make a clickable button.



## Example Response

```json
{
  "status": "success",
  "qr_code": "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABmvDolAAAABlBMVEX///8AAABVwtN+AAABsklEQVR4nO3WsQ3EIAwE0LnA/ld3MoQJc4K4v2ALzaKdg75vdv4qgQAEIAABCEAAAhCAAAQ@example",
  "payment_uri": "bitcoin:14PqCsA7KMgseZMPwg6mJy754MtQkrgszu?amount=0.1"
}
```