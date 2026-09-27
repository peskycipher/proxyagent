# Verify Webhook Signatures

> **WARNING**
>**Critical Security Step!** Always verify webhook signatures to ensure requests actually came from CryptAPI and haven't been tampered with. This prevents malicious actors from sending fake webhooks to your application.


CryptAPI uses a **1024-bit RSA SHA256 signature** with a public-key signature scheme to sign every webhook sent to your service. This ensures all data was sent from CryptAPI and can be trusted.

## How CryptAPI Signature Works

### What Gets Signed

- **For GET requests**: The full URL including all query parameters is signed
- **For POST requests**: The entire request body is signed

### Signature Details

- **Algorithm**: RSA SHA256 with PKCS1v15 padding
- **Key Size**: 1024-bit RSA key
- **Header**: Signature is sent in the `x-ca-signature` header
- **Encoding**: Signature is base64-encoded
- **Public Key**: Available at `https://api.cryptapi.io/pubkey/`

### Example Signed Data

For a GET request, the signed data looks like:
```bash
https://yoursite.com/webhook?uuid=dbfcb40e-5a6b-4305-9fa2-b0fbda6e3ff2&address_in=3PFoGK63cVVUWnd2vu7W1kM83NXUfvzMqM&txid_in=a2174ffd39289100709f2a07b129cdbba69df2e22e5be1830221dab1fd4e332c&value_coin=0.05&confirmations=3&pending=0
```

For a POST request, the signed data is the raw request body:
```bash
uuid=dbfcb40e-5a6b-4305-9fa2-b0fbda6e3ff2&address_in=3PFoGK63cVVUWnd2vu7W1kM83NXUfvzMqM&txid_in=a2174ffd39289100709f2a07b129cdbba69df2e22e5be1830221dab1fd4e332c&value_coin=0.05&confirmations=3&pending=0
```

## Implementation Examples

```javascript
// Node.js verification
const crypto = require('crypto');

// CryptAPI's public key (you can also fetch from https://api.cryptapi.io/pubkey/)
const CRYPTAPI_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3FT0Ym8b3myVxhQW7ESuuu6lo
dGAsUJs4fq+Ey//jm27jQ7HHHDmP1YJO7XE7Jf/0DTEJgcw4EZhJFVwsk6d3+4fy
Bsn0tKeyGMiaE6cVkX0cy6Y85o8zgc/CwZKc0uw6d5siAo++xl2zl+RGMXCELQVE
ox7pp208zTvown577wIDAQAB
-----END PUBLIC KEY-----`;

function verifyCryptAPISignature(req) {
    try {
        // Get signature from header
        const signature_b64 = req.headers['x-ca-signature'];
        if (!signature_b64) {
            console.error('Missing x-ca-signature header');
            return false;
        }
        
        // Decode signature from base64
        const signature = Buffer.from(signature_b64, 'base64');
        
        // Determine what data to verify based on request method
        let dataToVerify;
        if (req.method === 'GET') {
            // For GET requests, sign the full URL
            dataToVerify = req.protocol + '://' + req.get('host') + req.originalUrl;
        } else {
            // For POST requests, sign the raw body
            dataToVerify = req.rawBody; // You need raw body middleware
        }
        
        // Create verifier and verify signature
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(dataToVerify);
        
        const isValid = verifier.verify(CRYPTAPI_PUBLIC_KEY, signature);
        
        if (!isValid) {
            console.error('Invalid signature');
        }
        
        return isValid;
        
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

// Express middleware to capture raw body
function captureRawBody(req, res, next) {
    req.rawBody = '';
    req.on('data', chunk => {
        req.rawBody += chunk.toString();
    });
    req.on('end', () => {
        next();
    });
}

// Usage in Express
app.use('/webhook', captureRawBody);

app.post('/webhook', (req, res) => {
    if (!verifyCryptAPISignature(req)) {
        return res.status(401).send('Invalid signature');
    }
    
    // Process webhook safely
    console.log('Verified webhook received');
    res.status(200).send('*ok*');
});
```

```python
import base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

# CryptAPI's public key
CRYPTAPI_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3FT0Ym8b3myVxhQW7ESuuu6lo
dGAsUJs4fq+Ey//jm27jQ7HHHDmP1YJO7XE7Jf/0DTEJgcw4EZhJFVwsk6d3+4fy
Bsn0tKeyGMiaE6cVkX0cy6Y85o8zgc/CwZKc0uw6d5siAo++xl2zl+RGMXCELQVE
ox7pp208zTvown577wIDAQAB
-----END PUBLIC KEY-----"""

def verify_cryptapi_signature(request):
    """
    Verify CryptAPI webhook signature
    
    Args:
        request: Django HttpRequest or Flask request object
        
    Returns:
        bool: True if signature is valid, False otherwise
    """
    try:
        # Get signature from header
        signature_b64 = request.headers.get('x-ca-signature')
        if not signature_b64:
            print("Missing x-ca-signature header")
            return False
        
        # Determine what data to verify
        if request.method == 'GET':
            # For GET requests, sign the full URL
            data_to_verify = request.build_absolute_uri()
        else:
            # For POST requests, sign the raw body
            if hasattr(request, 'body'):
                # Django
                data_to_verify = request.body.decode('utf-8')
            else:
                # Flask
                data_to_verify = request.get_data(as_text=True)
        
        # Load public key
        public_key = serialization.load_pem_public_key(
            CRYPTAPI_PUBLIC_KEY.encode('utf-8'),
            backend=default_backend()
        )
        
        # Decode signature
        signature = base64.b64decode(signature_b64)
        
        # Verify signature
        public_key.verify(
            signature,
            data_to_verify.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        
        return True
        
    except Exception as e:
        print(f"Signature verification error: {e}")
        return False

# Django usage
def cryptapi_webhook(request):
    if not verify_cryptapi_signature(request):
        return HttpResponse('Invalid signature', status=401)
    
    # Process webhook safely
    print("Verified webhook received")
    return HttpResponse('*ok*')

# Flask usage
@app.route('/webhook', methods=['GET', 'POST'])
def cryptapi_webhook():
    if not verify_cryptapi_signature(request):
        return 'Invalid signature', 401
    
    # Process webhook safely
    print("Verified webhook received")
    return '*ok*'
```

```php
<?php

// CryptAPI's public key
const CRYPTAPI_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3FT0Ym8b3myVxhQW7ESuuu6lo
dGAsUJs4fq+Ey//jm27jQ7HHHDmP1YJO7XE7Jf/0DTEJgcw4EZhJFVwsk6d3+4fy
Bsn0tKeyGMiaE6cVkX0cy6Y85o8zgc/CwZKc0uw6d5siAo++xl2zl+RGMXCELQVE
ox7pp208zTvown577wIDAQAB
-----END PUBLIC KEY-----";

function verifyCryptAPISignature() {
    try {
        // Get signature from header
        $signatureHeader = $_SERVER['HTTP_X_CA_SIGNATURE'] ?? null;
        if (!$signatureHeader) {
            error_log('Missing x-ca-signature header');
            return false;
        }
        
        // Decode signature from base64
        $signature = base64_decode($signatureHeader);
        if ($signature === false) {
            error_log('Invalid base64 signature');
            return false;
        }
        
        // Determine what data to verify
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            // For GET requests, sign the full URL
            $dataToVerify = "https://$_SERVER[HTTP_HOST]$_SERVER[REQUEST_URI]";
        } else {
            // For POST requests, sign the raw body
            $dataToVerify = file_get_contents('php://input');
        }
        
        // Verify signature
        $result = openssl_verify($dataToVerify, $signature, CRYPTAPI_PUBLIC_KEY, OPENSSL_ALGO_SHA256);
        
        if ($result === 1) {
            return true;
        } elseif ($result === 0) {
            error_log('Invalid signature');
            return false;
        } else {
            error_log('Signature verification error: ' . openssl_error_string());
            return false;
        }
        
    } catch (Exception $e) {
        error_log('Signature verification exception: ' . $e->getMessage());
        return false;
    }
}

// Usage
if (!verifyCryptAPISignature()) {
    http_response_code(401);
    exit('Invalid signature');
}

// Process webhook safely
error_log('Verified webhook received');
http_response_code(200);
echo '*ok*';
?>
```


> **TIP**
>**Test signature verification!** Make sure to test the signature verification when testing your integration as it's a very important safety feature.


## Security Best Practices

1. **Always verify signatures** - Never skip signature verification in production
2. **Use HTTPS** - Ensure your webhook endpoint uses HTTPS
3. **Implement rate limiting** - Prevent abuse of your webhook endpoint
4. **Log security events** - Log all signature verification failures
5. **Validate webhook data** - Even verified webhooks should have data validation
6. **Use idempotency** - Prevent duplicate processing of webhooks

> **SUCCESS**
>**Signature Verification Complete!** Your webhook endpoint is now secure and can trust that all requests come from CryptAPI. Remember to test thoroughly and monitor for any verification failures.