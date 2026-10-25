<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Product photos are saved as files; lists send a short link instead of the photo. */
class ProductPhotoFilesTest extends TestCase
{
    use RefreshDatabase;

    /** A real 1×1 PNG picture as a data URL (what the photo picker sends). */
    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
    }

    private function storedPath(string $code): string
    {
        $value = Product::withTrashed()->where('code', $code)->value('image');
        $this->assertStringStartsWith('stored:product-photos/', (string) $value);

        return substr($value, strlen('stored:'));
    }

    public function test_a_chosen_photo_is_saved_as_a_file_and_lists_send_a_link(): void
    {
        $product = $this->postJson('/api/products', ['name' => 'Phone Case', 'image' => self::PNG])->assertCreated()->json();

        $path = $this->storedPath($product['id']);
        Storage::disk('local')->assertExists($path);
        $this->assertStringStartsWith('/products/'.$product['id'].'/image?v=', $product['image']);

        $listed = collect($this->getJson('/api/products')->assertOk()->json())->firstWhere('id', $product['id']);
        $this->assertSame($product['image'], $listed['image']);
        $this->assertStringNotContainsString('base64', $this->getJson('/api/products')->getContent());

        $photo = $this->get($listed['image'])->assertOk();
        $this->assertSame('image/png', $photo->headers->get('Content-Type'));
    }

    public function test_saving_the_form_without_touching_the_photo_keeps_it(): void
    {
        $product = $this->postJson('/api/products', ['name' => 'Charger', 'image' => self::PNG])->json();
        $path = $this->storedPath($product['id']);

        // The edit form sends back the same link.
        $this->putJson('/api/products/'.$product['id'], ['name' => 'Fast Charger', 'image' => $product['image']])
            ->assertOk()
            ->assertJsonPath('image', $product['image']);

        $this->assertSame($path, $this->storedPath($product['id']));
        Storage::disk('local')->assertExists($path);
    }

    public function test_replacing_or_removing_the_photo_deletes_the_old_file(): void
    {
        $product = $this->postJson('/api/products', ['name' => 'Cable', 'image' => self::PNG])->json();
        $first = $this->storedPath($product['id']);

        $this->putJson('/api/products/'.$product['id'], ['name' => 'Cable', 'image' => self::PNG])->assertOk();
        $second = $this->storedPath($product['id']);
        $this->assertNotSame($first, $second);
        Storage::disk('local')->assertMissing($first);

        $this->putJson('/api/products/'.$product['id'], ['name' => 'Cable', 'image' => ''])
            ->assertOk()
            ->assertJsonPath('image', null);
        Storage::disk('local')->assertMissing($second);
    }

    public function test_older_photos_saved_inside_the_database_still_show(): void
    {
        Product::create(['code' => 'PRD-OLD', 'name' => 'Old Photo', 'image' => self::PNG]);

        $listed = collect($this->getJson('/api/products')->json())->firstWhere('id', 'PRD-OLD');
        $this->assertStringStartsWith('/products/PRD-OLD/image?v=', $listed['image']);
        $this->get($listed['image'])->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    public function test_a_pasted_picture_link_is_kept_as_it_is(): void
    {
        $this->postJson('/api/products', ['name' => 'Linked', 'image' => 'https://example.com/a.png'])
            ->assertCreated()
            ->assertJsonPath('image', 'https://example.com/a.png');
    }

    public function test_only_real_pictures_are_accepted(): void
    {
        $svg = 'data:image/svg+xml;base64,'.base64_encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        $this->postJson('/api/products', ['name' => 'Bad', 'image' => $svg])->assertStatus(422)->assertJsonValidationErrors('image');
        $this->postJson('/api/products', ['name' => 'Bad', 'image' => 'data:image/png;base64,bm90IGEgcGljdHVyZQ=='])->assertStatus(422);
        $this->postJson('/api/products', ['name' => 'Script', 'image' => 'javascript:alert(1)'])->assertCreated()->assertJsonPath('image', null);
    }

    public function test_photo_link_needs_a_signed_in_user(): void
    {
        Product::create(['code' => 'PRD-P1', 'name' => 'Private', 'image' => self::PNG]);
        auth()->logout();

        $this->getJson('/products/PRD-P1/image')->assertUnauthorized();
    }

    public function test_move_photos_command_previews_then_moves(): void
    {
        $product = Product::create(['code' => 'PRD-MV', 'name' => 'Move Me', 'image' => self::PNG]);
        $updatedAt = $product->fresh()->updated_at;

        $this->artisan('inventory:move-photos')->assertSuccessful();
        $this->assertSame(self::PNG, $product->fresh()->image);   // preview changed nothing

        $this->artisan('inventory:move-photos', ['--apply' => true])->assertSuccessful();
        $path = $this->storedPath('PRD-MV');
        Storage::disk('local')->assertExists($path);
        $this->assertSame(base64_decode(substr(self::PNG, strpos(self::PNG, ',') + 1)), Storage::disk('local')->get($path));
        $this->assertEquals($updatedAt, $product->fresh()->updated_at);
    }
}
