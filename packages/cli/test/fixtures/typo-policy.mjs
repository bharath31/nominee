import { allow } from 'nominee'

export default {
  policy: {
    rules: [allow('emial.read')],
    fallback: 'deny',
  },
}
