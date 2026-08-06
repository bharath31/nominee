import { allow, deny } from 'nominee'

export default [allow('email.read'), deny('email.forward')]
