# Error Handling

When you make a request to the CryptAPI API, things can sometimes go wrong. This guide will help you understand the errors you might encounter and how to handle them gracefully.

## Common Issues and Solutions

### Funds Stuck in Address

**Issue**: Funds appear to be stuck in a cryptocurrency address and aren't being processed.

**Possible Causes**:
- Wrong cryptocurrency sent to the address. Eg. requested funds with `bep20/usdt` ticker and sent `bep20/usdc`
- Wrong network (e.g., sending ERC-20 tokens to BSC address)
- Minimum transaction amount not met

**Solutions**:
- Check if the address is valid for the specific cryptocurrency
- Verify the minimum transaction amount for the cryptocurrency
- If the wrong cryptocurrency was sent to the address and got stuck please contact our [support](support.cryptapi.io).

### Transaction Not Confirmed

**Issue**: Transaction is sent but remains unconfirmed for an extended period.

**Possible Causes**:
- Network congestion
- Transaction stuck in mempool

**Solutions**:
- Wait for network confirmation (can take 1-24 hours depending on the network)
- Check transaction status using the blockchain explorer

### Callback URL Problems

**Issue**: Webhook notifications not being received.

**Possible Causes**:
- Invalid or inaccessible callback URL
- Server not responding to webhook requests
- Firewall blocking incoming requests
- SSL certificate issues

**Solutions**:
- Ensure callback URL is publicly accessible
- Test the URL manually to verify it responds
- Check server logs for incoming webhook requests
- Verify SSL certificate is valid (for HTTPS URLs)
- Make sure your webhook signature verification is working
- Add our IPs `51.77.105.132` and `135.125.112.47` to your firewall (or Cloudflare) whitelist

By understanding these common errors and issues, you can build more robust integrations and handle problems more effectively. 

## Error Response Format

If an API request fails, CryptAPI returns an error response in JSON format. The response will always include a `status` field with a value of `error` and an `error` field containing a descriptive message.

```json
{
  "status": "error",
  "error": "API Key not provided"
}
```

## Common Errors

Here are the most common errors organized by HTTP status codes:

### HTTP Status Code: 400 (Bad Request)

- ``Non multi_token address already created for another token`` - In [ticker create](/api/tickercreate) when you try creating an address with the same callback URL for a different [``ticker``](/api/tickercreate#ticker) without [``multi_token``](/api/tickercreate#multi_token) parameter enabled
- ``Callback URL malformed, please provide a correct URL`` - In [ticker create](/api/tickercreate) endpoint when the [``callback``](/api/tickercreate#callback) parameter isn't valid
- ``You must provide a valid address`` - In [ticker create](/api/tickercreate) when the address provided in the [``address``](/api/tickercreate#address) parameter is not valid
- ``Maximum 20 output addresses`` - In [ticker create](/api/tickercreate) when the amount of addresses provided in the [``address``](/api/tickercreate#address) parameter exceeds 20
- ``You must provide a valid address and a callback`` - In [ticker create](/api/tickercreate) when you didn't provide an [``address``](/api/tickercreate#address) and a [``callback``](/api/tickercreate#callback) parameter
- ``No data or data malformed`` - Used in payout views when request data is invalid
- ``No notify url specified`` - Used in checkout deposit views when notification URL is missing
- ``Invalid ticker`` - The specified `{ticker}` is not supported or does not exist. More information about tickers [here](/get-started/tickers)
- ``Address is invalid`` - The provided cryptocurrency address is not valid for the specified network
- ``Callback URL is not a valid URL`` - In the [ticker create](/api/tickercreate), the URL you provided in the [`callback`](/api/tickercreate#callback) parameter is not a valid, publicly accessible URL
- ``Your request couldn't be processed, please try again later`` - Your request couldn't be processed, please try again later

### HTTP Status Code: 404 (Not Found)

- ``Resource not found`` - General 404 error
- ``Callback not found`` - When the callback provided in [logs endpoint](/api/tickerlogs) gave no results