$ErrorActionPreference = "Stop"

$projectUrl = "https://efjnltsombshrimuohtb.supabase.co"
$publishableKey = Read-Host "Supabase publishable key"
$bootstrapSecret = Read-Host "PORTAL_BOOTSTRAP_SECRET"

$headers = @{
  apikey = $publishableKey
  "Content-Type" = "application/json"
  "x-bootstrap-secret" = $bootstrapSecret
}

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "$projectUrl/functions/v1/manage-portal-user" `
  -Headers $headers `
  -Body '{"action":"bootstrap"}'

Write-Host ""
Write-Host "Benjamin is now the portal super admin."
Write-Host "Email: $($response.user.email)"
Write-Host "Temporary password: $($response.temporaryPassword)"
Write-Host ""
Write-Host "Store the temporary password securely. It must be replaced on first sign-in."
