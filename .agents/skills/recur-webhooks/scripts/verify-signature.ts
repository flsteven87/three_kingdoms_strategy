/**
 * Verify Recur webhook signature
 *
 * Usage:
 *   npx tsx verify-signature.ts <payload> <signature> <secret>
 *
 * Example:
 *   npx tsx verify-signature.ts '{"type":"checkout.completed"}' 'abc123...' 'whsec_xxx'
 */

import crypto from 'crypto'

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function main() {
  const args = process.argv.slice(2)

  if (args.length < 3) {
    console.log('Usage: npx tsx verify-signature.ts <payload> <signature> <secret>')
    console.log('')
    console.log('Example:')
    console.log(
      "  npx tsx verify-signature.ts '{\"type\":\"test\"}' 'abc123' 'whsec_xxx'"
    )
    process.exit(1)
  }

  const [payload, signature, secret] = args

  console.log('Payload:', payload.substring(0, 50) + '...')
  console.log('Signature:', signature.substring(0, 20) + '...')
  console.log('')

  const isValid = verifySignature(payload, signature, secret)

  if (isValid) {
    console.log('✅ Signature is VALID')
  } else {
    console.log('❌ Signature is INVALID')

    // Show expected signature for debugging
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    console.log('')
    console.log('Expected:', expected)
    console.log('Received:', signature)
  }

  process.exit(isValid ? 0 : 1)
}

main()
